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
