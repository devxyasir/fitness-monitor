import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { StorageOverviewDto } from '@replaycoach/types';

import { Recording, ReferenceVideo } from '../database/entities/others.entities';

const TREND_MONTHS = 6;

interface KindTotalsRow {
  totalRows: string;
  trackedRows: string;
  totalBytes: string;
}

interface OrgBytesRow {
  orgId: string | null;
  orgName: string | null;
  totalBytes: string;
}

interface MonthBytesRow {
  month: Date;
  totalBytes: string;
}

/**
 * Storage-stats aggregation for the admin status panel. sizeBytes is
 * populated going forward only (see migration 025) — pre-existing rows have
 * a null size_bytes and are surfaced as "untracked" (trackedRows < totalRows)
 * rather than silently dropped from the row counts.
 */
@Injectable()
export class AdminStorageService {
  constructor(
    @InjectRepository(Recording)
    private readonly recordingRepo: Repository<Recording>,
    @InjectRepository(ReferenceVideo)
    private readonly referenceRepo: Repository<ReferenceVideo>,
  ) {}

  async getOverview(): Promise<StorageOverviewDto> {
    const trendSince = new Date(Date.now() - TREND_MONTHS * 31 * 24 * 60 * 60 * 1000);

    const [
      recordingTotalsRaw,
      referenceTotalsRaw,
      recordingsByOrgRaw,
      referenceByOrgRaw,
      recordingsByMonthRaw,
      referenceByMonthRaw,
    ] = await Promise.all([
      this.recordingRepo
        .createQueryBuilder('r')
        .select('COUNT(*)', 'totalRows')
        .addSelect('COUNT(r.sizeBytes)', 'trackedRows')
        .addSelect('COALESCE(SUM(r.sizeBytes), 0)', 'totalBytes')
        .getRawOne<KindTotalsRow>(),
      this.referenceRepo
        .createQueryBuilder('rv')
        .select('COUNT(*)', 'totalRows')
        .addSelect('COUNT(rv.sizeBytes)', 'trackedRows')
        .addSelect('COALESCE(SUM(rv.sizeBytes), 0)', 'totalBytes')
        .getRawOne<KindTotalsRow>(),
      this.recordingRepo
        .createQueryBuilder('r')
        .leftJoin('r.session', 'session')
        .leftJoin('session.organization', 'org')
        .select('session.orgId', 'orgId')
        .addSelect('org.name', 'orgName')
        .addSelect('COALESCE(SUM(r.sizeBytes), 0)', 'totalBytes')
        .groupBy('session.orgId')
        .addGroupBy('org.name')
        .getRawMany<OrgBytesRow>(),
      this.referenceRepo
        .createQueryBuilder('rv')
        .leftJoin('rv.session', 'session')
        .leftJoin('session.organization', 'org')
        .select('session.orgId', 'orgId')
        .addSelect('org.name', 'orgName')
        .addSelect('COALESCE(SUM(rv.sizeBytes), 0)', 'totalBytes')
        .groupBy('session.orgId')
        .addGroupBy('org.name')
        .getRawMany<OrgBytesRow>(),
      this.recordingRepo
        .createQueryBuilder('r')
        .select("date_trunc('month', r.createdAt)", 'month')
        .addSelect('COALESCE(SUM(r.sizeBytes), 0)', 'totalBytes')
        .where('r.createdAt >= :trendSince', { trendSince })
        .groupBy('month')
        .getRawMany<MonthBytesRow>(),
      this.referenceRepo
        .createQueryBuilder('rv')
        .select("date_trunc('month', rv.createdAt)", 'month')
        .addSelect('COALESCE(SUM(rv.sizeBytes), 0)', 'totalBytes')
        .where('rv.createdAt >= :trendSince', { trendSince })
        .groupBy('month')
        .getRawMany<MonthBytesRow>(),
    ]);

    const recordings = {
      totalRows: Number(recordingTotalsRaw?.totalRows ?? 0),
      trackedRows: Number(recordingTotalsRaw?.trackedRows ?? 0),
      totalBytes: Number(recordingTotalsRaw?.totalBytes ?? 0),
    };
    const referenceVideos = {
      totalRows: Number(referenceTotalsRaw?.totalRows ?? 0),
      trackedRows: Number(referenceTotalsRaw?.trackedRows ?? 0),
      totalBytes: Number(referenceTotalsRaw?.totalBytes ?? 0),
    };

    return {
      recordings,
      referenceVideos,
      totalBytes: recordings.totalBytes + referenceVideos.totalBytes,
      byOrg: this.mergeByOrg(recordingsByOrgRaw, referenceByOrgRaw),
      byMonth: this.bucketMonthly(recordingsByMonthRaw, referenceByMonthRaw),
    };
  }

  private mergeByOrg(a: OrgBytesRow[], b: OrgBytesRow[]): StorageOverviewDto['byOrg'] {
    const byOrgId = new Map<string, { orgId: string | null; orgName: string | null; totalBytes: number }>();
    for (const row of [...a, ...b]) {
      const key = row.orgId ?? '__none__';
      const existing = byOrgId.get(key);
      const bytes = Number(row.totalBytes ?? 0);
      if (existing) {
        existing.totalBytes += bytes;
      } else {
        byOrgId.set(key, { orgId: row.orgId, orgName: row.orgName, totalBytes: bytes });
      }
    }
    return Array.from(byOrgId.values())
      .filter((row) => row.totalBytes > 0)
      .sort((x, y) => y.totalBytes - x.totalBytes);
  }

  /** Fills in zero-byte months so the trend has one point per month, oldest
   * first, even where neither raw grouped query has a row. */
  private bucketMonthly(a: MonthBytesRow[], b: MonthBytesRow[]): StorageOverviewDto['byMonth'] {
    const byMonth = new Map<string, number>();
    for (const row of [...a, ...b]) {
      const key = new Date(row.month).toISOString().slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + Number(row.totalBytes ?? 0));
    }
    const result: StorageOverviewDto['byMonth'] = [];
    const now = new Date();
    for (let i = TREND_MONTHS - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7);
      result.push({ month: key, totalBytes: byMonth.get(key) ?? 0 });
    }
    return result;
  }
}
