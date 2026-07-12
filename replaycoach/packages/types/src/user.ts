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

export interface UserListQuery {
  orgId?: string;
  role?: UserRole;
  status?: UserStatus;
  page?: number;
  pageSize?: number;
}

export interface UserListResponse {
  items: UserDto[];
  total: number;
  page: number;
  pageSize: number;
}
