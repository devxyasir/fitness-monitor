import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type {
  EmailTemplateSettings,
  InviteEmailTemplate,
  SmtpSettings,
  SystemSettingsDto,
  ThemeColorSet,
  ThemeSettings,
  UpdateSmtpSettingsDto,
} from '@replaycoach/types';

import { SystemSetting } from './system-setting.entity';

const DEFAULT_THEME: ThemeSettings = {
  light: { brand: '#B14A28', session: '#1F6F6B', analytics: '#8A6222' },
  dark: { brand: '#E2724A', session: '#3FA39C', analytics: '#D9A94A' },
};

const DEFAULT_INVITE_TEMPLATE: InviteEmailTemplate = {
  subject: "You're invited to join {{orgName}} on LetsMove",
  heading: "You're invited to join {{orgName}}",
  bodyIntro: '{{invitedByName}} invited you to join {{orgName}} on LetsMove as {{role}}.',
};

/** Deep-partial theme/template update shapes — a plain `Partial<T>` only
 * makes the top-level keys optional, not the nested color/copy fields the
 * admin UI actually submits partial edits of. */
interface UpdateThemeInput {
  light?: Partial<ThemeColorSet>;
  dark?: Partial<ThemeColorSet>;
}
interface UpdateEmailTemplatesInput {
  invite?: Partial<InviteEmailTemplate>;
}

/** Internal shape stored in the 'smtp' row — includes the raw password,
 * unlike SmtpSettings (the public DTO), which only ever exposes
 * `hasPassword`. Never let this type leak past this service. */
interface StoredSmtp {
  host?: string | undefined;
  port?: number | undefined;
  secure?: boolean | undefined;
  user?: string | undefined;
  from?: string | undefined;
  password?: string | undefined;
}

@Injectable()
export class SystemSettingsService {
  constructor(
    @InjectRepository(SystemSetting)
    private readonly repo: Repository<SystemSetting>,
    private readonly configService: ConfigService,
  ) {}

  private async getRaw<T>(key: SystemSetting['key']): Promise<T | null> {
    const row = await this.repo.findOne({ where: { key } });
    return (row?.value as T | undefined) ?? null;
  }

  private async upsert(key: SystemSetting['key'], value: Record<string, any>, updatedBy: string): Promise<void> {
    await this.repo.upsert({ key, value, updatedBy }, ['key']);
  }

  // ─── SMTP ────────────────────────────────────────────────────────────

  /** Public shape — never exposes the raw password. */
  async getSmtp(): Promise<SmtpSettings> {
    const stored = await this.getRaw<StoredSmtp>('smtp');
    return {
      host: stored?.host ?? this.configService.get<string>('smtp.host') ?? '',
      port: stored?.port ?? this.configService.get<number>('smtp.port') ?? 587,
      secure: stored?.secure ?? this.configService.get<boolean>('smtp.secure') ?? false,
      user: stored?.user ?? this.configService.get<string>('smtp.user') ?? '',
      from: stored?.from ?? this.configService.get<string>('smtp.from') ?? 'LetsMove <no-reply@morangoai.net>',
      hasPassword: !!(stored?.password ?? this.configService.get<string>('smtp.password')),
    };
  }

  /** Internal-only — EmailService is the sole caller; includes the raw
   * password. Never wire this into a controller response. */
  async getSmtpForSending(): Promise<StoredSmtp> {
    const stored = await this.getRaw<StoredSmtp>('smtp');
    return {
      host: stored?.host ?? this.configService.get<string>('smtp.host'),
      port: stored?.port ?? this.configService.get<number>('smtp.port') ?? 587,
      secure: stored?.secure ?? this.configService.get<boolean>('smtp.secure') ?? false,
      user: stored?.user ?? this.configService.get<string>('smtp.user'),
      from: stored?.from ?? this.configService.get<string>('smtp.from') ?? 'LetsMove <no-reply@morangoai.net>',
      password: stored?.password ?? this.configService.get<string>('smtp.password'),
    };
  }

  async updateSmtp(dto: UpdateSmtpSettingsDto, actingUserId: string): Promise<SmtpSettings> {
    const existing = (await this.getRaw<StoredSmtp>('smtp')) ?? {};
    const merged: StoredSmtp = {
      host: dto.host ?? existing.host,
      port: dto.port ?? existing.port,
      secure: dto.secure ?? existing.secure,
      user: dto.user ?? existing.user,
      from: dto.from ?? existing.from,
      // Explicit password field only overwrites when provided — omitting it
      // keeps whatever's already stored (mirrors "leave blank to keep").
      password: dto.password ?? existing.password,
    };
    await this.upsert('smtp', merged, actingUserId);
    return this.getSmtp();
  }

  // ─── Theme ───────────────────────────────────────────────────────────

  async getTheme(): Promise<ThemeSettings> {
    const stored = await this.getRaw<UpdateThemeInput>('theme');
    return {
      light: { ...DEFAULT_THEME.light, ...stored?.light },
      dark: { ...DEFAULT_THEME.dark, ...stored?.dark },
    };
  }

  async updateTheme(dto: UpdateThemeInput, actingUserId: string): Promise<ThemeSettings> {
    const existing = await this.getTheme();
    const merged: ThemeSettings = {
      light: { ...existing.light, ...dto.light },
      dark: { ...existing.dark, ...dto.dark },
    };
    await this.upsert('theme', merged, actingUserId);
    return merged;
  }

  // ─── Email templates ─────────────────────────────────────────────────

  async getEmailTemplates(): Promise<EmailTemplateSettings> {
    const stored = await this.getRaw<UpdateEmailTemplatesInput>('email_templates');
    return { invite: { ...DEFAULT_INVITE_TEMPLATE, ...stored?.invite } };
  }

  async updateEmailTemplates(dto: UpdateEmailTemplatesInput, actingUserId: string): Promise<EmailTemplateSettings> {
    const existing = await this.getEmailTemplates();
    const merged: EmailTemplateSettings = { invite: { ...existing.invite, ...dto.invite } };
    await this.upsert('email_templates', merged, actingUserId);
    return merged;
  }

  // ─── Aggregate (for the admin settings page's single load) ───────────

  async getAll(): Promise<SystemSettingsDto> {
    const [smtp, theme, emailTemplates] = await Promise.all([
      this.getSmtp(),
      this.getTheme(),
      this.getEmailTemplates(),
    ]);
    return { smtp, theme, emailTemplates };
  }
}
