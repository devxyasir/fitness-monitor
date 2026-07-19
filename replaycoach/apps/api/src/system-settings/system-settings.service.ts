import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type {
  EmailTemplateSettings,
  GeoAccessSettings,
  GeoSettingsVersionDto,
  GeoSettingsVersionListResponse,
  InviteEmailTemplate,
  PlatformSettings,
  SmtpSettings,
  SystemSettingsDto,
  ThemeColorSet,
  ThemeSettings,
  UpdateGeoAccessSettingsDto,
  UpdatePlatformSettingsDto,
  UpdateSmtpSettingsDto,
} from '@replaycoach/types';

import { SystemSetting } from './system-setting.entity';
import { GeoSettingsVersion } from './geo-settings-version.entity';
import { AuditService } from '../audit/audit.service';

const GEO_VERSIONS_LIST_LIMIT = 50;

const DEFAULT_THEME: ThemeSettings = {
  light: { brand: '#B14A28', session: '#1F6F6B', analytics: '#8A6222' },
  dark: { brand: '#E2724A', session: '#3FA39C', analytics: '#D9A94A' },
};

const DEFAULT_INVITE_TEMPLATE: InviteEmailTemplate = {
  subject: "You're invited to join {{orgName}} on LetsMove",
  heading: "You're invited to join {{orgName}}",
  bodyIntro: '{{invitedByName}} invited you to join {{orgName}} on LetsMove as {{role}}.',
};

const DEFAULT_PLATFORM: PlatformSettings = {
  maintenanceMode: false,
  allowPublicRegistration: true,
};

// Ships fully off — enabling restriction, and picking countries, is always
// an explicit admin action, never a side effect of deploying this code.
const DEFAULT_GEO_ACCESS: GeoAccessSettings = {
  enabled: false,
  mode: 'global',
  allowedCountries: [],
  allowedRegions: [],
  detectionMethod: 'ip',
  requireGpsPermission: false,
  fallbackToIp: true,
  strictMode: false,
  blockUnknownLocations: false,
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
    @InjectRepository(GeoSettingsVersion)
    private readonly geoVersionRepo: Repository<GeoSettingsVersion>,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
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
    void this.auditService.record(actingUserId, 'settings.smtp_updated', 'system_setting', null, {});
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
    void this.auditService.record(actingUserId, 'settings.theme_updated', 'system_setting', null, {});
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
    void this.auditService.record(actingUserId, 'settings.email_templates_updated', 'system_setting', null, {});
    return merged;
  }

  // ─── Platform toggles ────────────────────────────────────────────────

  async getPlatform(): Promise<PlatformSettings> {
    const stored = await this.getRaw<Partial<PlatformSettings>>('platform');
    return { ...DEFAULT_PLATFORM, ...stored };
  }

  async updatePlatform(dto: UpdatePlatformSettingsDto, actingUserId: string): Promise<PlatformSettings> {
    const existing = await this.getPlatform();
    const merged: PlatformSettings = { ...existing, ...dto };
    await this.upsert('platform', merged, actingUserId);
    void this.auditService.record(actingUserId, 'settings.platform_updated', 'system_setting', null, { ...dto });
    return merged;
  }

  // ─── Geo access control ──────────────────────────────────────────────

  async getGeoAccess(): Promise<GeoAccessSettings> {
    const stored = await this.getRaw<Partial<GeoAccessSettings>>('geo_access');
    return { ...DEFAULT_GEO_ACCESS, ...stored };
  }

  async updateGeoAccess(dto: UpdateGeoAccessSettingsDto, actingUserId: string): Promise<GeoAccessSettings> {
    const existing = await this.getGeoAccess();
    const merged: GeoAccessSettings = { ...existing, ...dto };
    await this.upsert('geo_access', merged, actingUserId);
    // Snapshot the POST-update merged state (not the dto, which may be a
    // partial patch) — the version row is always a complete, restorable
    // config, and the newest row always equals the live config.
    await this.geoVersionRepo.save(
      this.geoVersionRepo.create({ settings: merged, createdBy: actingUserId, label: null }),
    );
    void this.auditService.record(actingUserId, 'settings.geo_access_updated', 'system_setting', null, { ...dto });
    return merged;
  }

  async listGeoSettingsVersions(): Promise<GeoSettingsVersionListResponse> {
    const rows = await this.geoVersionRepo.find({
      relations: ['creator'],
      order: { createdAt: 'DESC' },
      take: GEO_VERSIONS_LIST_LIMIT,
    });
    return { items: rows.map((row) => this.geoVersionToDto(row)) };
  }

  /** Reuses updateGeoAccess() itself — the historical settings are a
   * complete snapshot, so passing them straight through as the "patch"
   * correctly overwrites every field, and the restore itself creates a new
   * version row (the timeline never loses the fact that a restore happened). */
  async restoreGeoSettingsVersion(versionId: string, actingUserId: string): Promise<GeoAccessSettings> {
    const version = await this.geoVersionRepo.findOne({ where: { id: versionId } });
    if (!version) throw new NotFoundException('Settings version not found');

    const restored = await this.updateGeoAccess(version.settings as GeoAccessSettings, actingUserId);
    void this.auditService.record(actingUserId, 'settings.geo_access_restored', 'system_setting', versionId, {});
    return restored;
  }

  private geoVersionToDto(row: GeoSettingsVersion): GeoSettingsVersionDto {
    return {
      id: row.id,
      settings: row.settings as GeoAccessSettings,
      createdBy: row.createdBy,
      createdByName: row.creator?.displayName ?? null,
      label: row.label,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ─── Aggregate (for the admin settings page's single load) ───────────

  async getAll(): Promise<SystemSettingsDto> {
    const [smtp, theme, emailTemplates, platform, geoAccess] = await Promise.all([
      this.getSmtp(),
      this.getTheme(),
      this.getEmailTemplates(),
      this.getPlatform(),
      this.getGeoAccess(),
    ]);
    return { smtp, theme, emailTemplates, platform, geoAccess };
  }
}
