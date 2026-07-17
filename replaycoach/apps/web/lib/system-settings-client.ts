/** system-settings-client — platform-admin config (SMTP, theme, email copy). */

import type {
  EmailTemplateSettings,
  SmtpSettings,
  SystemSettingsDto,
  ThemeSettings,
  UpdateEmailTemplatesDto,
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

async function updateSmtp(dto: UpdateSmtpSettingsDto): Promise<SmtpSettings> {
  return apiClient.patch('/system-settings/smtp', dto);
}

async function updateTheme(dto: Partial<ThemeSettings>): Promise<ThemeSettings> {
  return apiClient.patch('/system-settings/theme', dto);
}

async function updateEmailTemplates(dto: UpdateEmailTemplatesDto): Promise<EmailTemplateSettings> {
  return apiClient.patch('/system-settings/email-templates', dto);
}

export const systemSettingsClient = { getAll, getPublicTheme, updateSmtp, updateTheme, updateEmailTemplates };
