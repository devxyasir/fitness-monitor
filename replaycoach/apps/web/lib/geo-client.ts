/** geo-client — Geo Access Control: the public check endpoint plus the
 * platform_admin-only decision log. Settings themselves live in
 * system-settings-client.ts (PATCH /system-settings/geo-access), reusing
 * the existing settings aggregate rather than a parallel fetch. */

import type { GeoAccessLogListQuery, GeoAccessLogListResponse, GeoCheckRequest, GeoCheckResponse } from '@replaycoach/types';
import { apiClient } from './api-client';

/** Public — no auth required, called for logged-out visitors on /login and
 * /register too. */
async function check(dto: GeoCheckRequest): Promise<GeoCheckResponse> {
  return apiClient.post('/geo/check', dto);
}

async function listLogs(query: GeoAccessLogListQuery): Promise<GeoAccessLogListResponse> {
  const params = new URLSearchParams();
  if (query.countryCode) params.set('countryCode', query.countryCode);
  if (query.allowed !== undefined) params.set('allowed', String(query.allowed));
  if (query.detectionMethod) params.set('detectionMethod', query.detectionMethod);
  if (query.since) params.set('since', query.since);
  if (query.until) params.set('until', query.until);
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  const qs = params.toString();
  return apiClient.get(`/admin/geo/logs${qs ? `?${qs}` : ''}`);
}

export const geoClient = { check, listLogs };
