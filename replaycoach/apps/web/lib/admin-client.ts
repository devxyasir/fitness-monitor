/**
 * admin-client — the genuinely admin-exclusive endpoints (dashboard KPIs,
 * cross-org session monitoring, audit log) that don't belong to any single
 * domain client. All routes are platform_admin-only and step-up protected
 * (AdminElevatedGuard) — an ADMIN_ELEVATION_REQUIRED ApiError bubbles up
 * through apiClient the same way as any other error; see
 * AdminElevateModal for how the UI reacts to it.
 */

import type {
  AdminDashboardDto,
  AdminSessionListQuery,
  AdminSessionListResponse,
  AuditLogListQuery,
  AuditLogListResponse,
} from '@replaycoach/types';
import { apiClient } from './api-client';

async function getDashboard(): Promise<AdminDashboardDto> {
  return apiClient.get('/admin/dashboard');
}

function buildQuery(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string' && value !== '') params.set(key, value);
    else if (typeof value === 'number') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function listSessions(query: AdminSessionListQuery = {}): Promise<AdminSessionListResponse> {
  return apiClient.get(`/admin/sessions${buildQuery(query)}`);
}

async function listAuditLogs(query: AuditLogListQuery = {}): Promise<AuditLogListResponse> {
  return apiClient.get(`/admin/audit-logs${buildQuery(query)}`);
}

export const adminClient = { getDashboard, listSessions, listAuditLogs };
