import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { GeoCountryStat, GeoDailyPoint, GeoStatsResponse, GeoTotalsDto } from '@replaycoach/types';

import { GeoAccessLog } from './geo-access-log.entity';

const DEFAULT_DAILY_DAYS = 30;
const MAX_DAILY_DAYS = 90;
const TOP_COUNTRIES_LIMIT = 10;

interface DailyRow {
  day: Date;
  allowed: string;
  blocked: string;
}

interface CountryRow {
  countryCode: string;
  count: string;
}

/** Foundational aggregate queries for the geo-analytics dashboard (Geo
 * Access Control Phase 2) — bundled into one getStats() call since
 * geo_access_logs is confirmed low-volume, so there's no need to orchestrate
 * separate round trips per widget. Mirrors admin-dashboard.service.ts's
 * date_trunc/zero-fill pattern for the daily series. */
@Injectable()
export class GeoStatsService {
  constructor(
    @InjectRepository(GeoAccessLog)
    private readonly repo: Repository<GeoAccessLog>,
  ) {}

  async getStats(sinceIso?: string, dailyDays?: number): Promise<GeoStatsResponse> {
    const since = sinceIso ? new Date(sinceIso) : undefined;
    const cappedDailyDays = Math.min(Math.max(dailyDays || DEFAULT_DAILY_DAYS, 1), MAX_DAILY_DAYS);
    const dailySince = new Date(Date.now() - cappedDailyDays * 24 * 60 * 60 * 1000);

    const [totals, dailyRaw, topCountriesByVolume, topCountriesByBlocked] = await Promise.all([
      this.getTotals(since),
      this.repo
        .createQueryBuilder('g')
        .select("date_trunc('day', g.createdAt)", 'day')
        .addSelect('COUNT(*) FILTER (WHERE g.allowed = true)', 'allowed')
        .addSelect('COUNT(*) FILTER (WHERE g.allowed = false)', 'blocked')
        .where('g.createdAt >= :dailySince', { dailySince })
        .groupBy('day')
        .getRawMany<DailyRow>(),
      this.topCountries(since, 'volume'),
      this.topCountries(since, 'blocked'),
    ]);

    return {
      totals,
      daily: this.bucketDaily(dailyRaw, cappedDailyDays),
      topCountriesByVolume,
      topCountriesByBlocked,
    };
  }

  private async getTotals(since?: Date): Promise<GeoTotalsDto> {
    const qb = this.repo
      .createQueryBuilder('g')
      .select('COUNT(*)', 'totalChecks')
      .addSelect('COUNT(*) FILTER (WHERE g.allowed = false)', 'blockedChecks')
      .addSelect('COUNT(DISTINCT g.countryCode)', 'distinctCountries');
    if (since) qb.where('g.createdAt >= :since', { since });

    const row = await qb.getRawOne<{ totalChecks: string; blockedChecks: string; distinctCountries: string }>();
    const totalChecks = Number(row?.totalChecks ?? 0);
    const blockedChecks = Number(row?.blockedChecks ?? 0);

    return {
      totalChecks,
      blockedChecks,
      blockRate: totalChecks > 0 ? Math.round((blockedChecks / totalChecks) * 1000) / 10 : 0,
      distinctCountries: Number(row?.distinctCountries ?? 0),
    };
  }

  private async topCountries(since: Date | undefined, kind: 'volume' | 'blocked'): Promise<GeoCountryStat[]> {
    const qb = this.repo
      .createQueryBuilder('g')
      .select('g.countryCode', 'countryCode')
      .addSelect('COUNT(*)', 'count')
      .where('g.countryCode IS NOT NULL');
    if (since) qb.andWhere('g.createdAt >= :since', { since });
    if (kind === 'blocked') qb.andWhere('g.allowed = false');

    const rows = await qb
      .groupBy('g.countryCode')
      .orderBy('count', 'DESC')
      .limit(TOP_COUNTRIES_LIMIT)
      .getRawMany<CountryRow>();

    return rows.map((row) => ({ countryCode: row.countryCode, count: Number(row.count) }));
  }

  /** Fills in zero-count days so the chart has one point per day, oldest
   * first, even where the raw grouped query has no row. */
  private bucketDaily(rows: DailyRow[], days: number): GeoDailyPoint[] {
    const byDay = new Map<string, { allowed: number; blocked: number }>();
    for (const row of rows) {
      byDay.set(new Date(row.day).toISOString().slice(0, 10), {
        allowed: Number(row.allowed),
        blocked: Number(row.blocked),
      });
    }
    const result: GeoDailyPoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const point = byDay.get(date);
      result.push({ date, allowed: point?.allowed ?? 0, blocked: point?.blocked ?? 0 });
    }
    return result;
  }
}
