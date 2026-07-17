import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { AuditLogDto, AuditLogListQuery, AuditLogListResponse } from '@replaycoach/types';

import { AuditLog } from '../database/entities/others.entities';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/**
 * Wires up the `audit_logs` table (schema has existed since migration 005,
 * never previously read or written by anything — see AdminModule's audit
 * controller for the reader side). Lives in its own leaf module — not
 * folded into AdminModule — so every domain module that needs to record an
 * admin action (users, organizations, sessions, auth, system-settings) can
 * import it directly without risking a circular module dependency back
 * through AdminModule.
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async record(
    actorUserId: string | null,
    action: string,
    resourceType: string,
    resourceId: string | null,
    metadata: Record<string, unknown> = {},
    ipAddress: string | null = null,
  ): Promise<void> {
    await this.repo.save(
      this.repo.create({ actorUserId, action, resourceType, resourceId, metadata, ipAddress }),
    );
  }

  async list(query: AuditLogListQuery): Promise<AuditLogListResponse> {
    // Entity property names (camelCase), not DB column names — mixing raw
    // snake_case column names into .orderBy() alongside leftJoinAndSelect
    // breaks TypeORM's internal alias-resolution for paginated queries
    // (confirmed via manual testing: "Cannot read properties of undefined
    // (reading 'databaseName')" from createOrderByCombinedWithSelectExpression).
    // .andWhere() raw fragments don't hit that code path, but camelCase is
    // used throughout here anyway for consistency.
    const qb = this.repo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.actor', 'actor')
      .orderBy('a.createdAt', 'DESC');

    if (query.actorUserId) qb.andWhere('a.actorUserId = :actorUserId', { actorUserId: query.actorUserId });
    if (query.action) qb.andWhere('a.action = :action', { action: query.action });
    if (query.resourceType) qb.andWhere('a.resourceType = :resourceType', { resourceType: query.resourceType });
    if (query.resourceId) qb.andWhere('a.resourceId = :resourceId', { resourceId: query.resourceId });
    if (query.since) qb.andWhere('a.createdAt >= :since', { since: new Date(query.since) });
    if (query.until) qb.andWhere('a.createdAt <= :until', { until: new Date(query.until) });

    const pageSize = Math.min(Math.max(1, query.pageSize || DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const page = Math.max(1, query.page || 1);

    const [rows, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      items: rows.map((row) => this.toDto(row)),
      total,
      page,
      pageSize,
    };
  }

  private toDto(row: AuditLog): AuditLogDto {
    return {
      id: row.id,
      actorUserId: row.actorUserId,
      actorName: row.actor?.displayName ?? null,
      actorEmail: row.actor?.email ?? null,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      metadata: row.metadata,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
