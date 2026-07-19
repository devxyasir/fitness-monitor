import type { AdminNotificationsResponse } from '@replaycoach/types';
import { apiClient } from './api-client';

async function getFeed(): Promise<AdminNotificationsResponse> {
  return apiClient.get('/admin/notifications');
}

async function markSeen(): Promise<{ lastSeenAt: string }> {
  return apiClient.post('/admin/notifications/mark-seen', {});
}

export const adminNotificationsClient = { getFeed, markSeen };
