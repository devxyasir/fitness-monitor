import type { UserRole } from './auth';

/** Free-form, no fixed schema yet — kept as an open bag rather than rigid
 * columns so adding a new setting/branding field never needs a migration.
 * `any` (not `unknown`) matches this codebase's existing jsonb column
 * convention (see e.g. AuditLog.metadata) — TypeORM's recursive
 * QueryDeepPartialEntity mapped type can't resolve an index-signature
 * object typed `unknown` when it's nested several relations deep. */
export type OrgSettings = Record<string, any>;
export type OrgBranding = Record<string, any>;

/** 'suspended' is a platform_admin moderation flag — org admins/coaches see
 * a banner; it does not (in this phase) cascade into locking out members'
 * own sessions, which nothing currently reads. */
export type OrgStatus = 'active' | 'suspended';

export interface OrganizationDto {
  id: string;
  name: string;
  planTier: string;
  status: OrgStatus;
  settings: OrgSettings;
  branding: OrgBranding;
  createdBy: string | null;
  createdAt: string;
}

export interface UpdateOrgStatusDto {
  status: OrgStatus;
}

export interface CreateOrganizationDto {
  name: string;
}

/** Platform-admin cross-org listing — an OrganizationDto plus roster
 * counts, computed server-side rather than requiring a second round trip
 * per org to list its members just to count them. */
export interface OrganizationSummaryDto extends OrganizationDto {
  coachCount: number;
  studentCount: number;
}

// ─── Org/coach → member email ───────────────────────────────────────────

/** A studio_admin/platform_admin can message coaches or students in their
 * org; a plain coach can only message students. Subject/body formatting
 * (subject suffix, sign-off) is applied server-side — see EmailService — so
 * every message looks consistent regardless of who sends it. */
export interface SendOrgMessageDto {
  recipientIds: string[];
  subject: string;
  message: string;
}

export interface SendOrgMessageResult {
  sent: number;
  failed: { userId: string; reason: string }[];
}

export interface UpdateOrganizationDto {
  name?: string;
  settings?: OrgSettings;
  branding?: OrgBranding;
}

// ─── Teams ───────────────────────────────────────────────────────────────

export type TeamRole = 'lead' | 'member';

export interface TeamDto {
  id: string;
  orgId: string;
  name: string;
  createdBy: string | null;
  memberCount: number;
  createdAt: string;
}

export interface TeamMemberDto {
  id: string;
  teamId: string;
  userId: string;
  role: TeamRole;
  joinedAt: string;
  user: {
    displayName: string;
    email: string;
    avatarUrl: string | null;
  } | null;
}

export interface CreateTeamDto {
  name: string;
}

export interface UpdateTeamDto {
  name?: string;
}

export interface AddTeamMemberDto {
  userId: string;
  role?: TeamRole;
}

// ─── Invitations ─────────────────────────────────────────────────────────

/** `teamId` is optional — an org-level invite (no team) vs an invite that
 * also drops the invitee straight into a specific team on acceptance. */
export interface InviteToOrgDto {
  email: string;
  role: Extract<UserRole, 'coach' | 'student'>;
  teamId?: string | null;
}

/** Returned only at creation/resend time — never re-exposed by the list
 * endpoint, since the raw token is the entire security boundary for
 * redeeming the invite. */
export interface CreateInviteResponse {
  inviteToken: string;
  expiresAt: string;
}

/** Metadata for an org's invite list — no token included (see above). */
export interface OrgInviteDto {
  id: string;
  orgId: string;
  invitedEmail: string;
  role: Extract<UserRole, 'coach' | 'student'>;
  teamId: string | null;
  invitedBy: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

/** Public preview (GET /invites/:token, unauthenticated) — deliberately
 * minimal: no invited-email echo, no token, so a link that leaked further
 * than intended doesn't disclose more than "you'd be joining X as a Y". */
export interface InvitePreviewDto {
  orgName: string;
  role: Extract<UserRole, 'coach' | 'student'>;
  teamName: string | null;
  expired: boolean;
  alreadyUsed: boolean;
}
