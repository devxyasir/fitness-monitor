import type { UserRole } from './auth';

export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  orgId: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export interface UpdateUserDto {
  displayName?: string;
  avatarUrl?: string;
}
