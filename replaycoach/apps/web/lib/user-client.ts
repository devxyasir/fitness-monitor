/** user-client — self-service profile/password endpoints (PATCH /users/me*). */

import type { UpdateUserDto, UserDto } from '@replaycoach/types';
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

export const userClient = { updateProfile, changePassword, uploadAvatar };
