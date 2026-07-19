import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

import { SystemSettingsService } from '../system-settings/system-settings.service';
import { EmailLogService } from './email-log.service';
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

/** Who to attribute a send to in the delivery log — userId is the eventual
 * recipient's account when known (org messages always know it; invites
 * usually don't, since the invitee may not have an account yet). */
export interface EmailLogContext {
  orgId: string;
  triggeredByUserId: string;
  userId?: string | null;
}

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

  constructor(
    private readonly settingsService: SystemSettingsService,
    private readonly emailLogService: EmailLogService,
  ) {}

  /** A broken log write must never mask (or worsen) the actual send outcome
   * — wrapped separately from the send logic itself. */
  private async logAttempt(
    kind: 'invite' | 'org_message',
    recipientEmail: string,
    status: 'success' | 'failure',
    context: EmailLogContext,
    errorMessage?: string,
  ): Promise<void> {
    try {
      await this.emailLogService.record({
        recipientEmail,
        kind,
        status,
        errorMessage: errorMessage ?? null,
        orgId: context.orgId,
        userId: context.userId ?? null,
        triggeredByUserId: context.triggeredByUserId,
      });
    } catch (err) {
      this.logger.error('Failed to write email delivery log', err instanceof Error ? err.stack : err);
    }
  }

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

  async sendInviteEmail(
    to: string,
    params: Omit<InviteEmailParams, 'template'>,
    context: EmailLogContext,
  ): Promise<void> {
    const [conn, emailTemplates] = await Promise.all([
      this.getTransporter(),
      this.settingsService.getEmailTemplates(),
    ]);
    const fullParams: InviteEmailParams = { ...params, template: emailTemplates.invite };

    if (!conn) {
      this.logger.warn('SMTP not configured — emails will be logged, not sent.');
      this.logger.log(`[email skipped, no SMTP configured] Invite for ${to}: ${params.inviteUrl}`);
      await this.logAttempt('invite', to, 'failure', context, 'SMTP not configured');
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
      await this.logAttempt('invite', to, 'success', context);
    } catch (err) {
      // An invite is still valid and usable via its link even if delivery
      // fails (e.g. a typo'd address, a transient SMTP error) — log and move
      // on rather than failing the invite-creation request the admin is
      // waiting on.
      const message = err instanceof Error ? err.message : 'Delivery failed';
      this.logger.error(`Failed to send invite email to ${to}`, err instanceof Error ? err.stack : err);
      await this.logAttempt('invite', to, 'failure', context, message);
    }
  }

  /** Unlike sendInviteEmail, this throws on failure — the org-message
   * composer needs to report per-recipient delivery status back to the
   * sender, not silently swallow it (see OrganizationService.sendMessage). */
  async sendOrgMessage(to: string, params: OrgMessageEmailParams, context: EmailLogContext): Promise<void> {
    const conn = await this.getTransporter();
    if (!conn) {
      await this.logAttempt('org_message', to, 'failure', context, 'SMTP not configured');
      throw new Error('Email delivery is not configured for this organization yet.');
    }
    try {
      await conn.transporter.sendMail({
        from: conn.from,
        to,
        subject: formatOrgMessageSubject(params),
        html: renderOrgMessageEmailHtml(params),
        text: formatOrgMessageText(params),
      });
      await this.logAttempt('org_message', to, 'success', context);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delivery failed';
      await this.logAttempt('org_message', to, 'failure', context, message);
      throw err;
    }
  }
}
