import type { GeoDetectionMethod } from './system-settings';

// ─── POST /geo/check ──────────────────────────────────────────────────────

/** Only used when the admin's configured detectionMethod is 'gps' — the
 * browser's navigator.geolocation coordinates. */
export interface GeoCheckRequest {
  lat?: number;
  lon?: number;
}

export interface GeoLocationDto {
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
}

export interface GeoCheckResponse {
  allowed: boolean;
  location: GeoLocationDto | null;
  reason?: string;
}

// ─── Admin geo logs ───────────────────────────────────────────────────────

export interface GeoAccessLogDto {
  id: string;
  userId: string | null;
  ip: string;
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  detectionMethod: GeoDetectionMethod;
  allowed: boolean;
  reason: string | null;
  createdAt: string;
}

export interface GeoAccessLogListQuery {
  countryCode?: string;
  allowed?: boolean;
  detectionMethod?: GeoDetectionMethod;
  since?: string;
  until?: string;
  page?: number;
  pageSize?: number;
}

export interface GeoAccessLogListResponse {
  items: GeoAccessLogDto[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Geo analytics (admin/geo/stats) ─────────────────────────────────────

export interface GeoTotalsDto {
  totalChecks: number;
  blockedChecks: number;
  /** Percentage, 0-100, one decimal place. */
  blockRate: number;
  distinctCountries: number;
}

/** 'YYYY-MM-DD', oldest first, zero-filled — see GeoStatsService.getStats. */
export interface GeoDailyPoint {
  date: string;
  allowed: number;
  blocked: number;
}

export interface GeoCountryStat {
  countryCode: string;
  count: number;
}

export interface GeoStatsQuery {
  /** ISO timestamp — omit for all-time totals/top-countries. Does not bound
   * the daily series, which always caps at `dailyDays`. */
  since?: string;
  /** Days of zero-filled daily series to return, default 30, capped 90. */
  dailyDays?: number;
}

export interface GeoStatsResponse {
  totals: GeoTotalsDto;
  daily: GeoDailyPoint[];
  topCountriesByVolume: GeoCountryStat[];
  topCountriesByBlocked: GeoCountryStat[];
}
