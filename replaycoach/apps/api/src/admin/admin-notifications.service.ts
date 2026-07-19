import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { AdminNotificationDto, AdminNotificationsResponse } from '@replaycoach/types';

import { AuditLog } from '../database/entities/others.entities';
import { GeoAccessLog } from '../geo/geo-access-log.entity';
import { UserService } from '../users/user.service';

const FEED_LIMIT = 50;
const FRESH_CURSOR_LOOKBACK_MS = 24 * 60 * 60 * 1000; // 24h

/** Every admin session produces one of these — pure self-noise in a feed
 * meant to surface things a platform_admin didn't already know happened. */
const EXCLUDED_AUDIT_ACTIONS = ['admin.login', 'admin.elevate'];

/**
 * Notification bell backing service — deliberately NOT a new "events"
 * table. audit_logs and geo_access_logs already accumulate exactly the
 * events an admin would want surfaced; this just reads both and merges
 * them by time. Poll-based (see AdminNotificationsController), not
 * real-time push — no admin-wide socket room exists in this codebase and
 * building one is out of scope for this pass (see the live-activity-feed
 * deferral).
 */
@Injectable()
export class AdminNotificationsService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
    @InjectRepository(GeoAccessLog)
    private readonly geoRepo: Repository<GeoAccessLog>,
    private readonly userService: UserService,
  ) {}

  private async resolveSince(userId: string): Promise<{ since: Date; lastSeenAt: Date | null }> {
    const user = await this.userService.findById(userId);
    if (user.adminNotificationsSeenAt) {
      return { since: user.adminNotificationsSeenAt, lastSeenAt: user.adminNotificationsSeenAt };
    }
    // First-ever check for this admin — default to a 24h lookback rather
    // than the platform's entire history, so a brand-new admin account
    // isn't immediately flooded with every audit entry ever recorded.
    return { since: new Date(Date.now() - FRESH_CURSOR_LOOKBACK_MS), lastSeenAt: null };
  }

  private async fetchFeed(since: Date, limit: number): Promise<AdminNotificationDto[]> {
    const [auditRows, geoRows] = await Promise.all([
      this.auditRepo
        .createQueryBuilder('a')
        .leftJoinAndSelect('a.actor', 'actor')
        .where('a.createdAt > :since', { since })
        .andWhere('a.action NOT IN (:...excluded)', { excluded: EXCLUDED_AUDIT_ACTIONS })
        .orderBy('a.createdAt', 'DESC')
        .take(limit)
        .getMany(),
      this.geoRepo
        .createQueryBuilder('g')
        .where('g.createdAt > :since', { since })
        .andWhere('g.allowed = false')
        .orderBy('g.createdAt', 'DESC')
        .take(limit)
        .getMany(),
    ]);

    const items: AdminNotificationDto[] = [
      ...auditRows.map((row): AdminNotificationDto => ({
        id: `audit:${row.id}`,
        kind: 'audit',
        action: row.action,
        actorName: row.actor?.displayName ?? null,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        countryCode: null,
        createdAt: row.createdAt.toISOString(),
      })),
      ...geoRows.map((row): AdminNotificationDto => ({
        id: `geo:${row.id}`,
        kind: 'geo_blocked',
        action: null,
        actorName: null,
        resourceType: null,
        resourceId: null,
        countryCode: row.countryCode,
        createdAt: row.createdAt.toISOString(),
      })),
    ];

    items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    return items.slice(0, limit);
  }

  async getFeed(userId: string): Promise<AdminNotificationsResponse> {
    const { since, lastSeenAt } = await this.resolveSince(userId);
    const items = await this.fetchFeed(since, FEED_LIMIT);
    const unreadCount = items.length;
    return { items, unreadCount, lastSeenAt: lastSeenAt?.toISOString() ?? null };
  }

  async markSeen(userId: string): Promise<{ lastSeenAt: string }> {
    const now = await this.userService.touchAdminNotificationsSeenAt(userId);
    return { lastSeenAt: now.toISOString() };
  }
}
