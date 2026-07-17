import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

import { renderInviteEmailHtml, renderInviteEmailText, type InviteEmailParams } from './templates/invite-email';

/**
 * SMTP is optional (see config.schema.ts) — without it, this logs a warning
 * and returns without sending. That keeps invite creation itself always
 * working (the UI still shows/copies the link) even before SMTP is
 * configured on a fresh deployment, rather than the whole invite flow
 * hard-failing on a missing mail server.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('smtp.host');
    const user = this.configService.get<string>('smtp.user');
    const password = this.configService.get<string>('smtp.password');
    this.from = this.configService.get<string>('smtp.from') ?? 'LetsMove <no-reply@morangoai.net>';

    if (host && user && password) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.configService.get<number>('smtp.port') ?? 587,
        secure: this.configService.get<boolean>('smtp.secure') ?? false,
        auth: { user, pass: password },
      });
    } else {
      this.logger.warn('SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASSWORD) — emails will be logged, not sent.');
    }
  }

  async sendInviteEmail(to: string, params: InviteEmailParams): Promise<void> {
    const subject = `You're invited to join ${params.orgName} on LetsMove`;

    if (!this.transporter) {
      this.logger.log(`[email skipped, no SMTP configured] Invite for ${to}: ${params.inviteUrl}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        html: renderInviteEmailHtml(params),
        text: renderInviteEmailText(params),
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
