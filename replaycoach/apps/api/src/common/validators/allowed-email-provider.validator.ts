import { registerDecorator, type ValidationOptions } from 'class-validator';

/**
 * Restricts invite emails to a small allowlist of major consumer providers
 * (gmail.com, outlook/hotmail/live.com, yahoo.com) — a deliberate guard
 * against typo'd/fake/disposable addresses on invites, per product
 * decision. Does not apply to self-registration (the org-founder path),
 * only to InviteToOrgDto — an org may legitimately be founded by someone
 * using a custom work domain, but invites are the higher-risk path (an
 * admin acting on someone else's behalf, more likely to typo an address).
 */
const ALLOWED_EMAIL_DOMAINS = ['gmail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com'];

export function IsAllowedEmailProvider(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAllowedEmailProvider',
      target: object.constructor,
      propertyName,
      options: {
        message: `Email must be a Gmail, Outlook, or Yahoo address (allowed: ${ALLOWED_EMAIL_DOMAINS.join(', ')})`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          const domain = value.split('@')[1]?.toLowerCase();
          return !!domain && ALLOWED_EMAIL_DOMAINS.includes(domain);
        },
      },
    });
  };
}
