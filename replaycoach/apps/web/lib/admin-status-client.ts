import type { ReadinessResponse, StorageOverviewDto } from '@replaycoach/types';
import { apiClient } from './api-client';

async function getDependencies(): Promise<ReadinessResponse> {
  return apiClient.get('/admin/status/dependencies');
}

async function getStorage(): Promise<StorageOverviewDto> {
  return apiClient.get('/admin/status/storage');
}

export const adminStatusClient = { getDependencies, getStorage };
