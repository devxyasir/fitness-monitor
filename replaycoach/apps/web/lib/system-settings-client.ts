/** system-settings-client — platform-admin config (SMTP, theme, email copy). */

import type {
  EmailTemplateSettings,
  GeoAccessSettings,
  GeoSettingsVersionListResponse,
  PlatformSettings,
  SmtpSettings,
  SystemSettingsDto,
  SystemStatusDto,
  ThemeSettings,
  UpdateEmailTemplatesDto,
  UpdateGeoAccessSettingsDto,
  UpdatePlatformSettingsDto,
  UpdateSmtpSettingsDto,
} from '@replaycoach/types';
import { apiClient } from './api-client';

async function getAll(): Promise<SystemSettingsDto> {
  return apiClient.get('/system-settings');
}

/** Public — no auth required, safe to call before login (marketing pages). */
async function getPublicTheme(): Promise<ThemeSettings> {
  return apiClient.get('/system-settings/theme');
}

/** Public — checked by the root layout before rendering anything, to show
 * a maintenance page to non-admin visitors. */
async function getPublicStatus(): Promise<SystemStatusDto> {
  return apiClient.get('/system-settings/status');
}

async function updateSmtp(dto: UpdateSmtpSettingsDto): Promise<SmtpSettings> {
  return apiClient.patch('/system-settings/smtp', dto);
}

async function updateTheme(dto: Partial<ThemeSettings>): Promise<ThemeSettings> {
  return apiClient.patch('/system-settings/theme', dto);
}

async function updateEmailTemplates(dto: UpdateEmailTemplatesDto): Promise<EmailTemplateSettings> {
  return apiClient.patch('/system-settings/email-templates', dto);
}

async function updatePlatform(dto: UpdatePlatformSettingsDto): Promise<PlatformSettings> {
  return apiClient.patch('/system-settings/platform', dto);
}

async function updateGeoAccess(dto: UpdateGeoAccessSettingsDto): Promise<GeoAccessSettings> {
  return apiClient.patch('/system-settings/geo-access', dto);
}

async function listGeoSettingsVersions(): Promise<GeoSettingsVersionListResponse> {
  return apiClient.get('/system-settings/geo-access/versions');
}

async function restoreGeoSettingsVersion(id: string): Promise<GeoAccessSettings> {
  return apiClient.post(`/system-settings/geo-access/versions/${id}/restore`, {});
}

export const systemSettingsClient = {
  getAll,
  getPublicTheme,
  getPublicStatus,
  updateSmtp,
  updateTheme,
  updateEmailTemplates,
  updatePlatform,
  updateGeoAccess,
  listGeoSettingsVersions,
  restoreGeoSettingsVersion,
};
