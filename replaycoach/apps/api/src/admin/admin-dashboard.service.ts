import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { AdminDashboardDto } from '@replaycoach/types';

import { User } from '../users/user.entity';
import { Organization } from '../organizations/organization.entity';
import { Session } from '../sessions/session.entity';

const TREND_DAYS = 14;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Platform-wide KPIs — mirrors the query-builder style already used in
 * dashboard.service.ts's getCoachOverview (createQueryBuilder + getCount /
 * date_trunc bucketing), just scoped to the whole platform instead of one
 * coach. Every number here is a real query — no hardcoded placeholders. */
@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
  ) {}

  async getOverview(): Promise<AdminDashboardDto> {
    const since = new Date(Date.now() - WEEK_MS);
    const trendSince = new Date(Date.now() - TREND_DAYS * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalOrganizations,
      activeSessionsNow,
      signupsThisWeek,
      sessionsThisWeek,
      signupsTrendRaw,
      sessionsTrendRaw,
    ] = await Promise.all([
      this.userRepo.createQueryBuilder('u').getCount(),
      this.orgRepo.createQueryBuilder('o').getCount(),
      this.sessionRepo.createQueryBuilder('s').where("s.status = 'live'").getCount(),
      this.userRepo
        .createQueryBuilder('u')
        .where('u.created_at >= :since', { since })
        .getCount(),
      this.sessionRepo
        .createQueryBuilder('s')
        .where('s.scheduled_at >= :since', { since })
        .getCount(),
      this.userRepo
        .createQueryBuilder('u')
        .select("date_trunc('day', u.created_at)", 'day')
        .addSelect('COUNT(*)', 'value')
        .where('u.created_at >= :trendSince', { trendSince })
        .groupBy('day')
        .getRawMany<{ day: Date; value: string }>(),
      this.sessionRepo
        .createQueryBuilder('s')
        .select("date_trunc('day', s.scheduled_at)", 'day')
        .addSelect('COUNT(*)', 'value')
        .where('s.scheduled_at >= :trendSince', { trendSince })
        .groupBy('day')
        .getRawMany<{ day: Date; value: string }>(),
    ]);

    return {
      totalUsers,
      totalOrganizations,
      activeSessionsNow,
      signupsThisWeek,
      sessionsThisWeek,
      signupsTrend: this.bucketDaily(signupsTrendRaw),
      sessionsTrend: this.bucketDaily(sessionsTrendRaw),
    };
  }

  /** Fills in zero-count days so the sparkline has one point per day,
   * oldest first, even where the raw grouped query has no row. */
  private bucketDaily(rows: { day: Date; value: string }[]): number[] {
    const byDay = new Map<string, number>();
    for (const row of rows) {
      byDay.set(new Date(row.day).toISOString().slice(0, 10), Number(row.value));
    }
    const result: number[] = [];
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      result.push(byDay.get(day) ?? 0);
    }
    return result;
  }
}
