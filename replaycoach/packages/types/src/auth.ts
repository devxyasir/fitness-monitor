/**
 * Shared auth types and DTOs.
 * Used by both apps/api (validation) and apps/web (typed fetch calls).
 */

export type UserRole = 'platform_admin' | 'studio_admin' | 'coach' | 'student';

export interface JwtPayload {
  /** User UUID */
  sub: string;
  email: string;
  role: UserRole;
  /** UUID of the user's organization — null for unaffiliated users */
  orgId: string | null;
  /**
   * Incremented on password change or forced logout.
   * Strategy validates this against the DB value to enable instant invalidation.
   * See 06_Authentication_Authorization_RBAC.md §7.
   */
  sessionVersion: number;
  /**
   * Epoch ms of the most recent password verification performed specifically
   * for admin access (initial /admin/login, or a later step-up re-auth via
   * POST /auth/admin/elevate). Absent on every normal login. AdminElevatedGuard
   * requires this to be within ADMIN_ELEVATION_TTL of "now" for any
   * admin-exclusive route — this is what makes the admin area step-up
   * protected rather than just role-gated like everything else.
   */
  adminAuthAt?: number;
  iat?: number;
  exp?: number;
}

export interface TokenResponse {
  accessToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  /** Persistent login: long-lived refresh cookie that survives browser close. */
  rememberMe?: boolean;
  /**
   * Set by the dedicated /admin/login page. When present, the server
   * rejects any non-platform_admin credential pair outright (no normal
   * session is issued) and stamps a fresh `adminAuthAt` onto the token.
   */
  context?: 'admin';
}

/** Body for POST /auth/admin/elevate — re-verifies the already-logged-in
 * platform_admin's password to refresh a stale `adminAuthAt` without a full
 * re-login. */
export interface AdminElevateRequest {
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
  role: Extract<UserRole, 'coach' | 'student'>;
  /** Redeems an org (and optionally team) invite as part of registration —
   * the invite's org/role win over `role` above. Required for `role:
   * 'student'` — a student account can't self-register without one. */
  inviteToken?: string;
}
