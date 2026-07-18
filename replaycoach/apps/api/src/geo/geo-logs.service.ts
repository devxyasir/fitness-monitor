import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { GeoAccessLogDto, GeoAccessLogListQuery, GeoAccessLogListResponse } from '@replaycoach/types';

import { GeoAccessLog } from './geo-access-log.entity';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/** Read side of geo_access_logs — mirrors AuditService.list()'s
 * query-builder/pagination shape for consistency across the two admin log
 * viewers. GeoCheckService owns the write side (one row per fresh check). */
@Injectable()
export class GeoLogsService {
  constructor(
    @InjectRepository(GeoAccessLog)
    private readonly repo: Repository<GeoAccessLog>,
  ) {}

  async list(query: GeoAccessLogListQuery): Promise<GeoAccessLogListResponse> {
    const qb = this.repo.createQueryBuilder('g').orderBy('g.createdAt', 'DESC');

    if (query.countryCode) qb.andWhere('g.countryCode = :countryCode', { countryCode: query.countryCode });
    if (query.allowed !== undefined) qb.andWhere('g.allowed = :allowed', { allowed: query.allowed });
    if (query.detectionMethod) qb.andWhere('g.detectionMethod = :detectionMethod', { detectionMethod: query.detectionMethod });
    if (query.since) qb.andWhere('g.createdAt >= :since', { since: new Date(query.since) });
    if (query.until) qb.andWhere('g.createdAt <= :until', { until: new Date(query.until) });

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

  private toDto(row: GeoAccessLog): GeoAccessLogDto {
    return {
      id: row.id,
      userId: row.userId,
      ip: row.ip,
      country: row.country,
      countryCode: row.countryCode,
      region: row.region,
      city: row.city,
      detectionMethod: row.detectionMethod,
      allowed: row.allowed,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
