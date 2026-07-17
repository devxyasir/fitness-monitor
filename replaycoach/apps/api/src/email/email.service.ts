import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

import { SystemSettingsService } from '../system-settings/system-settings.service';
import {
  renderInviteEmailHtml,
  renderInviteEmailSubject,
  renderInviteEmailText,
  type InviteEmailParams,
} from './templates/invite-email';

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

  async sendInviteEmail(to: string, params: Omit<InviteEmailParams, 'template'>): Promise<void> {
    const [smtp, emailTemplates] = await Promise.all([
      this.settingsService.getSmtpForSending(),
      this.settingsService.getEmailTemplates(),
    ]);
    const fullParams: InviteEmailParams = { ...params, template: emailTemplates.invite };

    if (!smtp.host || !smtp.user || !smtp.password) {
      this.logger.warn('SMTP not configured — emails will be logged, not sent.');
      this.logger.log(`[email skipped, no SMTP configured] Invite for ${to}: ${params.inviteUrl}`);
      return;
    }

    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port ?? 587,
        secure: smtp.secure ?? false,
        auth: { user: smtp.user, pass: smtp.password },
      });
      await transporter.sendMail({
        from: smtp.from,
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
}
