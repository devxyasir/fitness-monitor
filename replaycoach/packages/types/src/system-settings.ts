// ─── SMTP ────────────────────────────────────────────────────────────────

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  /** The password itself is write-only — never round-tripped back to the
   * client (same principle as invite tokens) — this just tells the admin UI
   * whether one is already configured. */
  hasPassword: boolean;
}

export interface UpdateSmtpSettingsDto {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  from?: string;
  /** Omit to keep the existing password; pass a value to replace it. */
  password?: string;
}

// ─── Theme / brand colors ───────────────────────────────────────────────

export interface ThemeColorSet {
  brand: string;
  session: string;
  analytics: string;
}

export interface ThemeSettings {
  light: ThemeColorSet;
  dark: ThemeColorSet;
}

// ─── Email template copy ────────────────────────────────────────────────

/** Editable copy only — the surrounding HTML structure/layout is fixed
 * (see apps/api/src/email/templates/invite-email.ts). Supports
 * `{{orgName}}`, `{{invitedByName}}`, `{{role}}` placeholders. */
export interface InviteEmailTemplate {
  subject: string;
  heading: string;
  bodyIntro: string;
}

export interface EmailTemplateSettings {
  invite: InviteEmailTemplate;
}

export interface UpdateEmailTemplatesDto {
  invite?: Partial<InviteEmailTemplate>;
}

// ─── Platform toggles ────────────────────────────────────────────────────

export interface PlatformSettings {
  /** Non-admin visitors see a full-page maintenance notice instead of the
   * app; platform_admin always bypasses so they can turn it back off. */
  maintenanceMode: boolean;
  /** When false, POST /auth/register without an inviteToken is blocked —
   * invite-based registration is a separate code path and stays open. */
  allowPublicRegistration: boolean;
}

export interface UpdatePlatformSettingsDto {
  maintenanceMode?: boolean;
  allowPublicRegistration?: boolean;
}

/** Public (unauthenticated) — GET /system-settings/status, checked by the
 * root layout before anything else renders for a non-admin visitor.
 * Deliberately minimal — only fields a client-side gate needs to decide its
 * next move, never the allowed-countries list or anything else sensitive. */
export interface SystemStatusDto {
  maintenanceMode: boolean;
  geoEnabled: boolean;
  geoDetectionMethod: GeoDetectionMethod;
  geoFallbackToIp: boolean;
  geoStrictMode: boolean;
}

// ─── Geo access control ──────────────────────────────────────────────────

export type GeoDetectionMethod = 'ip' | 'gps';

/** A country's allowed regions — free-text name match against whatever the
 * IP/GPS provider reports (not a validated cascading dropdown; see the geo
 * access plan's "Honest Phase-1 simplification" note). Empty `regionNames`
 * means the whole country is allowed. */
export interface GeoAllowedRegion {
  countryCode: string;
  regionNames: string[];
}

export interface GeoAccessSettings {
  /** Master switch — false means no checks run anywhere, full open access,
   * regardless of `mode`. Ships false; turning it on is always an explicit
   * admin action. */
  enabled: boolean;
  mode: 'global' | 'restricted';
  /** ISO 3166-1 alpha-2 codes. */
  allowedCountries: string[];
  allowedRegions: GeoAllowedRegion[];
  detectionMethod: GeoDetectionMethod;
  /** Only meaningful when detectionMethod === 'gps'. */
  requireGpsPermission: boolean;
  /** GPS denied/unavailable → fall back to an IP-based check instead of
   * blocking outright. Ignored when strictMode is on. */
  fallbackToIp: boolean;
  /** GPS denied → block immediately, overriding fallbackToIp. */
  strictMode: boolean;
  /** A visitor whose location couldn't be determined at all (provider
   * outage, unroutable IP) is blocked instead of allowed through. */
  blockUnknownLocations: boolean;
}

export type UpdateGeoAccessSettingsDto = Partial<GeoAccessSettings>;

/** A saved snapshot of GeoAccessSettings, taken on every successful save —
 * see apps/api/src/system-settings/geo-settings-version.entity.ts. */
export interface GeoSettingsVersionDto {
  id: string;
  settings: GeoAccessSettings;
  createdBy: string | null;
  createdByName: string | null;
  label: string | null;
  createdAt: string;
}

export interface GeoSettingsVersionListResponse {
  items: GeoSettingsVersionDto[];
}

// ─── Aggregate ───────────────────────────────────────────────────────────

export interface SystemSettingsDto {
  smtp: SmtpSettings;
  theme: ThemeSettings;
  emailTemplates: EmailTemplateSettings;
  platform: PlatformSettings;
  geoAccess: GeoAccessSettings;
}
