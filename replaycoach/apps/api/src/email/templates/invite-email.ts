/**
 * Invite email — HTML matches the app's warm-neutral light theme (email
 * clients can't be trusted with CSS custom properties, `prefers-color-scheme`
 * dark-mode support, or the self-hosted Fraunces font, so this is a static
 * light-mode-only approximation: same clay brand color, same near-black ink,
 * a serif system-font stack standing in for Fraunces). Table-based layout —
 * not flexbox/grid — for reliable rendering across email clients.
 */

export interface InviteEmailParams {
  orgName: string;
  role: 'coach' | 'student';
  inviteUrl: string;
  invitedByName: string;
}

const BRAND = '#B14A28';
const INK = '#2A2118';
const INK_MUTED = '#6B5D4F';
const CANVAS = '#F7F3EE';
const PANEL = '#FFFFFF';
const HAIRLINE = '#E4DDD2';

export function renderInviteEmailHtml(params: InviteEmailParams): string {
  const { orgName, role, inviteUrl, invitedByName } = params;
  const roleLabel = role === 'student' ? 'a student' : 'a coach';
  const escapedOrgName = escapeHtml(orgName);
  const escapedInvitedBy = escapeHtml(invitedByName);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>You're invited to ${escapedOrgName}</title>
</head>
<body style="margin:0;padding:0;background-color:${CANVAS};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CANVAS};padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:${PANEL};border:1px solid ${HAIRLINE};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:36px 40px 28px;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:15px;font-weight:700;color:${BRAND};letter-spacing:0.02em;">
                LetsMove
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 8px;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.3;color:${INK};font-weight:600;">
                You're invited to join ${escapedOrgName}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 28px;">
              <p style="margin:0;font-size:15px;line-height:1.6;color:${INK_MUTED};">
                ${escapedInvitedBy} invited you to join <strong style="color:${INK};">${escapedOrgName}</strong> on LetsMove as ${roleLabel}.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 36px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:999px;background-color:${BRAND};">
                    <a href="${inviteUrl}" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">
                      Accept invite
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 36px;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:${INK_MUTED};word-break:break-all;">
                Or paste this link into your browser:<br>
                <a href="${inviteUrl}" style="color:${BRAND};">${inviteUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid ${HAIRLINE};">
              <p style="margin:0;font-size:12px;line-height:1.6;color:${INK_MUTED};">
                This invite expires in 7 days. If you weren't expecting this, you can safely ignore this email.
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

export function renderInviteEmailText(params: InviteEmailParams): string {
  const { orgName, role, inviteUrl, invitedByName } = params;
  const roleLabel = role === 'student' ? 'a student' : 'a coach';
  return `${invitedByName} invited you to join ${orgName} on LetsMove as ${roleLabel}.

Accept your invite: ${inviteUrl}

This invite expires in 7 days. If you weren't expecting this, you can safely ignore this email.

Powered by MorangoAi`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
