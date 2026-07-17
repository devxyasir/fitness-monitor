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

// ─── Aggregate ───────────────────────────────────────────────────────────

export interface SystemSettingsDto {
  smtp: SmtpSettings;
  theme: ThemeSettings;
  emailTemplates: EmailTemplateSettings;
}
