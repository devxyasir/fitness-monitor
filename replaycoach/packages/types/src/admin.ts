import type { SessionDto, SessionStatus } from './session';

// ─── Dashboard ───────────────────────────────────────────────────────────

/** Real, queried counts — never hardcoded placeholders. See
 * apps/api/src/admin/admin-dashboard.service.ts. */
export interface AdminDashboardDto {
  totalUsers: number;
  totalOrganizations: number;
  activeSessionsNow: number;
  signupsThisWeek: number;
  sessionsThisWeek: number;
  /** Daily counts, oldest first, 14 days. */
  signupsTrend: number[];
  sessionsTrend: number[];
}

// ─── Audit log ───────────────────────────────────────────────────────────

export interface AuditLogDto {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditLogListQuery {
  actorUserId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  since?: string;
  until?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditLogListResponse {
  items: AuditLogDto[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Cross-org session monitoring ───────────────────────────────────────

/** SessionDto plus the denormalized fields the admin table needs, so the
 * frontend isn't doing an N+1 lookup per row to show "who/where" — mirrors
 * OrganizationSummaryDto's existing extend-with-computed-fields pattern. */
export interface AdminSessionDto extends SessionDto {
  coachName: string;
  orgName: string | null;
  participantCount: number;
}

export interface AdminSessionListQuery {
  status?: SessionStatus;
  orgId?: string;
  coachId?: string;
  since?: string;
  until?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminSessionListResponse {
  items: AdminSessionDto[];
  total: number;
  page: number;
  pageSize: number;
}
