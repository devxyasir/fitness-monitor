import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { EmailLogDto, EmailLogListQuery, EmailLogListResponse } from '@replaycoach/types';

import { EmailLog } from './email-log.entity';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

interface RecordEmailLogInput {
  recipientEmail: string;
  kind: 'invite' | 'org_message';
  status: 'success' | 'failure';
  errorMessage?: string | null;
  orgId?: string | null;
  userId?: string | null;
  triggeredByUserId?: string | null;
}

/** Leaf module (see email-log.module.ts) mirroring AuditService's own
 * write-from-many-places/read-from-admin shape — EmailService is the only
 * writer today, AdminEmailLogController the only reader. */
@Injectable()
export class EmailLogService {
  constructor(
    @InjectRepository(EmailLog)
    private readonly repo: Repository<EmailLog>,
  ) {}

  async record(input: RecordEmailLogInput): Promise<void> {
    await this.repo.save(
      this.repo.create({
        recipientEmail: input.recipientEmail,
        kind: input.kind,
        status: input.status,
        errorMessage: input.errorMessage ?? null,
        orgId: input.orgId ?? null,
        userId: input.userId ?? null,
        triggeredByUserId: input.triggeredByUserId ?? null,
      }),
    );
  }

  async list(query: EmailLogListQuery): Promise<EmailLogListResponse> {
    const qb = this.repo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.org', 'org')
      .leftJoinAndSelect('e.triggeredBy', 'triggeredBy')
      .orderBy('e.createdAt', 'DESC');

    if (query.kind) qb.andWhere('e.kind = :kind', { kind: query.kind });
    if (query.status) qb.andWhere('e.status = :status', { status: query.status });
    if (query.orgId) qb.andWhere('e.orgId = :orgId', { orgId: query.orgId });
    if (query.since) qb.andWhere('e.createdAt >= :since', { since: new Date(query.since) });
    if (query.until) qb.andWhere('e.createdAt <= :until', { until: new Date(query.until) });

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

  private toDto(row: EmailLog): EmailLogDto {
    return {
      id: row.id,
      recipientEmail: row.recipientEmail,
      kind: row.kind,
      status: row.status,
      errorMessage: row.errorMessage,
      orgId: row.orgId,
      orgName: row.org?.name ?? null,
      userId: row.userId,
      triggeredByUserId: row.triggeredByUserId,
      triggeredByName: row.triggeredBy?.displayName ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
