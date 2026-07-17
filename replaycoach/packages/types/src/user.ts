import type { UserRole } from './auth';

/**
 * Account lifecycle state — independent of email verification.
 * 'active': normal use. 'suspended'/'disabled': admin-moderated lockout
 * (enforced at login/refresh and against already-issued access tokens).
 * 'pending': reserved for a future not-yet-activated state.
 */
export type UserStatus = 'active' | 'pending' | 'suspended' | 'disabled';

export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  orgId: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  emailVerified: boolean;
  lastLoginAt: string | null;
  /** IP address captured at the most recent successful login — null until
   * the first login after this field was introduced. */
  lastLoginIp: string | null;
  /** Whether TOTP 2FA is turned on for this account — never exposes the
   * secret or backup codes themselves. */
  totpEnabled: boolean;
  /** 0-100. Computed from optional profile fields (currently just avatar +
   * email verification — the profile model is intentionally minimal today). */
  profileCompleteness: number;
  createdAt: string;
}

export interface UpdateUserDto {
  displayName?: string;
  avatarUrl?: string;
}

export interface UpdateUserStatusDto {
  status: UserStatus;
}

/** platform_admin only — role changes are a stronger privilege than status
 * changes, which studio_admin can also perform within their own org. */
export interface UpdateUserRoleDto {
  role: UserRole;
}

export interface UserListQuery {
  orgId?: string;
  role?: UserRole;
  status?: UserStatus;
  /** Matches against email/displayName (case-insensitive, substring). */
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface UserListResponse {
  items: UserDto[];
  total: number;
  page: number;
  pageSize: number;
}

/** One active refresh-token row for a user — the security/sessions panel's
 * "log out this device" list. No device fingerprint exists on the
 * underlying table, so this deliberately doesn't invent one. */
export interface UserSessionDto {
  id: string;
  rememberMe: boolean;
  createdAt: string;
  expiresAt: string;
}

// ─── TOTP 2FA (optional, self-service for platform_admin accounts) ───────

/** Returned once, at enrollment time — the secret/backup codes are never
 * re-exposed after this (only `totpEnabled: boolean` on UserDto going
 * forward). The QR code is rendered client-side from `otpauthUrl`. */
export interface TotpEnrollResponse {
  secret: string;
  otpauthUrl: string;
  backupCodes: string[];
}

export interface TotpVerifyDto {
  /** 6-digit code from the authenticator app, confirming enrollment. */
  token: string;
}

export interface TotpDisableDto {
  password: string;
}
