import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

import { SystemSettingsService } from '../system-settings/system-settings.service';
import {
  renderInviteEmailHtml,
  renderInviteEmailSubject,
  renderInviteEmailText,
  type InviteEmailParams,
} from './templates/invite-email';
import {
  formatOrgMessageSubject,
  formatOrgMessageText,
  renderOrgMessageEmailHtml,
  type OrgMessageEmailParams,
} from './templates/org-message-email';

/**
 * SMTP config is DB-backed (SystemSettingsService, admin-editable) with env
 * vars as the seed/fallback for a fresh deployment — see that service for
 * the precedence rule. Rebuilding the transporter per send (instead of once
 * at construction) is what makes credentials editable at runtime without a
 * process restart; nodemailer transporter construction is cheap (no
 * connection opened until send).
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly settingsService: SystemSettingsService) {}

  private async getTransporter(): Promise<{ transporter: Transporter; from: string } | null> {
    const smtp = await this.settingsService.getSmtpForSending();
    if (!smtp.host || !smtp.user || !smtp.password) return null;
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port ?? 587,
      secure: smtp.secure ?? false,
      auth: { user: smtp.user, pass: smtp.password },
    });
    return { transporter, from: smtp.from ?? 'LetsMove <no-reply@morangoai.net>' };
  }

  async sendInviteEmail(to: string, params: Omit<InviteEmailParams, 'template'>): Promise<void> {
    const [conn, emailTemplates] = await Promise.all([
      this.getTransporter(),
      this.settingsService.getEmailTemplates(),
    ]);
    const fullParams: InviteEmailParams = { ...params, template: emailTemplates.invite };

    if (!conn) {
      this.logger.warn('SMTP not configured — emails will be logged, not sent.');
      this.logger.log(`[email skipped, no SMTP configured] Invite for ${to}: ${params.inviteUrl}`);
      return;
    }

    try {
      await conn.transporter.sendMail({
        from: conn.from,
        to,
        subject: renderInviteEmailSubject(fullParams),
        html: renderInviteEmailHtml(fullParams),
        text: renderInviteEmailText(fullParams),
      });
    } catch (err) {
      // An invite is still valid and usable via its link even if delivery
      // fails (e.g. a typo'd address, a transient SMTP error) — log and move
      // on rather than failing the invite-creation request the admin is
      // waiting on.
      this.logger.error(`Failed to send invite email to ${to}`, err instanceof Error ? err.stack : err);
    }
  }

  /** Unlike sendInviteEmail, this throws on failure — the org-message
   * composer needs to report per-recipient delivery status back to the
   * sender, not silently swallow it (see OrganizationService.sendMessage). */
  async sendOrgMessage(to: string, params: OrgMessageEmailParams): Promise<void> {
    const conn = await this.getTransporter();
    if (!conn) {
      throw new Error('Email delivery is not configured for this organization yet.');
    }
    await conn.transporter.sendMail({
      from: conn.from,
      to,
      subject: formatOrgMessageSubject(params),
      html: renderOrgMessageEmailHtml(params),
      text: formatOrgMessageText(params),
    });
  }
}
