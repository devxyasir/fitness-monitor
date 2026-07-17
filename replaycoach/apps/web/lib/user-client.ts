/** user-client — self-service profile/password endpoints (PATCH /users/me*)
 * plus the admin-facing user-directory/moderation/security endpoints
 * (platform_admin / studio_admin only, enforced server-side). */

import type {
  TotpEnrollResponse,
  UpdateUserDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
  UserDto,
  UserListQuery,
  UserListResponse,
  UserSessionDto,
} from '@replaycoach/types';
import { apiClient } from './api-client';

async function updateProfile(dto: UpdateUserDto): Promise<UserDto> {
  return apiClient.patch('/users/me', dto);
}

async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return apiClient.patch('/users/me/password', { currentPassword, newPassword });
}

async function uploadAvatar(file: File): Promise<UserDto> {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.postForm('/users/me/avatar', formData);
}

async function enrollTotp(): Promise<TotpEnrollResponse> {
  return apiClient.post('/users/me/totp/enroll', {});
}

async function confirmTotp(token: string): Promise<void> {
  return apiClient.post('/users/me/totp/confirm', { token });
}

async function disableTotp(password: string): Promise<void> {
  return apiClient.post('/users/me/totp/disable', { password });
}

// ─── Admin user directory/moderation ─────────────────────────────────────

function buildQuery(query: UserListQuery): string {
  const params = new URLSearchParams();
  if (query.orgId) params.set('orgId', query.orgId);
  if (query.role) params.set('role', query.role);
  if (query.status) params.set('status', query.status);
  if (query.search) params.set('search', query.search);
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function listUsers(query: UserListQuery = {}): Promise<UserListResponse> {
  return apiClient.get(`/users${buildQuery(query)}`);
}

async function getUser(id: string): Promise<UserDto> {
  return apiClient.get(`/users/${id}`);
}

async function setUserStatus(id: string, dto: UpdateUserStatusDto): Promise<UserDto> {
  return apiClient.patch(`/users/${id}/status`, dto);
}

async function setUserRole(id: string, dto: UpdateUserRoleDto): Promise<UserDto> {
  return apiClient.patch(`/users/${id}/role`, dto);
}

async function forceLogout(id: string): Promise<void> {
  return apiClient.post(`/users/${id}/force-logout`, {});
}

async function listUserSessions(id: string): Promise<UserSessionDto[]> {
  return apiClient.get(`/users/${id}/sessions`);
}

async function revokeUserSession(id: string, tokenId: string): Promise<void> {
  return apiClient.del(`/users/${id}/sessions/${tokenId}`);
}

export const userClient = {
  updateProfile,
  changePassword,
  uploadAvatar,
  enrollTotp,
  confirmTotp,
  disableTotp,
  listUsers,
  getUser,
  setUserStatus,
  setUserRole,
  forceLogout,
  listUserSessions,
  revokeUserSession,
};
