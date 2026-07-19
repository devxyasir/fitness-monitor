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
  hidden: boolean;
  hiddenReason: string | null;
  hiddenAt: string | null;
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

// ─── Cross-org clip oversight ────────────────────────────────────────────

export interface AdminClipDto {
  id: string;
  title: string;
  sessionId: string;
  orgId: string | null;
  orgName: string | null;
  createdBy: string;
  creatorName: string;
  clipType: 'recording' | 'reference';
  startMs: number;
  endMs: number;
  createdAt: string;
  hidden: boolean;
  hiddenReason: string | null;
  hiddenAt: string | null;
  /** True if the clip is inaccessible because its parent session is
   * hidden, even if the clip itself isn't individually flagged. */
  sessionHidden: boolean;
}

export interface AdminClipListQuery {
  sessionId?: string;
  orgId?: string;
  hidden?: boolean;
  since?: string;
  until?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminClipListResponse {
  items: AdminClipDto[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Notification bell ──────────────────────────────────────────────────

/** A merged, time-sorted view over audit_logs and geo_access_logs — see
 * apps/api/src/admin/admin-notifications.service.ts. Not a persisted
 * "events" table of its own. */
export interface AdminNotificationDto {
  id: string;
  kind: 'audit' | 'geo_blocked';
  /** Audit action string (e.g. 'user.status_changed') — null for geo_blocked. */
  action: string | null;
  actorName: string | null;
  resourceType: string | null;
  resourceId: string | null;
  /** Set for geo_blocked entries only. */
  countryCode: string | null;
  createdAt: string;
}

export interface AdminNotificationsResponse {
  items: AdminNotificationDto[];
  unreadCount: number;
  lastSeenAt: string | null;
}

// ─── Storage stats ───────────────────────────────────────────────────────

/** sizeBytes is populated going forward only (migration 025) — trackedRows
 * counts rows with a known size, totalRows counts every row, so the
 * frontend can show "X of Y tracked" instead of implying full coverage. */
export interface StorageKindStats {
  totalRows: number;
  trackedRows: number;
  totalBytes: number;
}

export interface StorageOrgStats {
  orgId: string | null;
  orgName: string | null;
  totalBytes: number;
}

/** 'YYYY-MM', oldest first. */
export interface StorageMonthPoint {
  month: string;
  totalBytes: number;
}

export interface StorageOverviewDto {
  recordings: StorageKindStats;
  referenceVideos: StorageKindStats;
  totalBytes: number;
  byOrg: StorageOrgStats[];
  byMonth: StorageMonthPoint[];
}

// ─── Email delivery log ──────────────────────────────────────────────────

export interface EmailLogDto {
  id: string;
  recipientEmail: string;
  kind: 'invite' | 'org_message';
  status: 'success' | 'failure';
  errorMessage: string | null;
  orgId: string | null;
  orgName: string | null;
  userId: string | null;
  triggeredByUserId: string | null;
  triggeredByName: string | null;
  createdAt: string;
}

export interface EmailLogListQuery {
  kind?: 'invite' | 'org_message';
  status?: 'success' | 'failure';
  orgId?: string;
  since?: string;
  until?: string;
  page?: number;
  pageSize?: number;
}

export interface EmailLogListResponse {
  items: EmailLogDto[];
  total: number;
  page: number;
  pageSize: number;
}
