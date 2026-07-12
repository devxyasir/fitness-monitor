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
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
  role: Extract<UserRole, 'coach' | 'student'>;
}
