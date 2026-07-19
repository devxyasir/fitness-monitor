import type { AdminClipDto, AdminClipListQuery, AdminClipListResponse } from '@replaycoach/types';
import { apiClient } from './api-client';

function buildQuery(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string' && value !== '') params.set(key, value);
    else if (typeof value === 'number') params.set(key, String(value));
    else if (typeof value === 'boolean') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function listClips(query: AdminClipListQuery = {}): Promise<AdminClipListResponse> {
  return apiClient.get(`/admin/clips${buildQuery(query)}`);
}

async function hideClip(id: string, reason: string): Promise<AdminClipDto> {
  return apiClient.post(`/admin/clips/${id}/hide`, { reason });
}

async function unhideClip(id: string): Promise<AdminClipDto> {
  return apiClient.post(`/admin/clips/${id}/unhide`, {});
}

export const adminClipsClient = { listClips, hideClip, unhideClip };
