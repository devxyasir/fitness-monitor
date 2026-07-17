/**
 * Org/coach → member email — same visual language as invite-email.ts
 * (warm-neutral light theme, table-based layout for email-client safety).
 * Subject/body formatting is fixed, defined once here, not left to each
 * caller to reconstruct — see OrganizationService.sendMessage.
 */

const BRAND = '#B14A28';
const INK = '#2A2118';
const INK_MUTED = '#6B5D4F';
const CANVAS = '#F7F3EE';
const PANEL = '#FFFFFF';
const HAIRLINE = '#E4DDD2';

export interface OrgMessageEmailParams {
  orgName: string;
  /** Org-wide message ("Regards, {orgName}") vs a coach's own
   * ("Regards, {coachName}\n{orgName}") — see signOff below. */
  senderKind: 'organization' | 'coach';
  senderName: string;
  subject: string;
  message: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** `{User Subject} — {Coaching Academy Name}` */
export function formatOrgMessageSubject(params: OrgMessageEmailParams): string {
  return `${params.subject} — ${params.orgName}`;
}

function signOffLines(params: OrgMessageEmailParams): string[] {
  return params.senderKind === 'coach' ? [params.senderName, params.orgName] : [params.orgName];
}

/** Plain-text body: `{message}\n\nRegards,\n{signOff}`. */
export function formatOrgMessageText(params: OrgMessageEmailParams): string {
  return `${params.message}\n\nRegards,\n${signOffLines(params).join('\n')}`;
}

export function renderOrgMessageEmailHtml(params: OrgMessageEmailParams): string {
  const subject = escapeHtml(formatOrgMessageSubject(params));
  // Preserve line breaks the sender typed — this is a plain-text compose
  // box, not rich text, so escaping then swapping \n for <br> is safe and
  // sufficient (no markup to worry about smuggling through).
  const messageHtml = escapeHtml(params.message).replace(/\n/g, '<br>');
  const signOffHtml = signOffLines(params).map(escapeHtml).join('<br>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:${CANVAS};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CANVAS};padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:${PANEL};border:1px solid ${HAIRLINE};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:36px 40px 8px;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:15px;font-weight:700;color:${BRAND};letter-spacing:0.02em;">
                LetsMove
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 8px;">
              <p style="margin:0;font-size:15px;line-height:1.7;color:${INK};white-space:pre-wrap;">${messageHtml}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 36px;">
              <p style="margin:0;font-size:14px;line-height:1.6;color:${INK_MUTED};">
                Regards,<br>${signOffHtml}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid ${HAIRLINE};">
              <p style="margin:0;font-size:11px;line-height:1.6;color:${INK_MUTED};">
                Sent via LetsMove on behalf of ${escapeHtml(params.orgName)}.
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:20px 0 0;font-size:11px;color:${INK_MUTED};">
          Powered by MorangoAi
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
