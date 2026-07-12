import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';

const REFRESH_COOKIE_NAME = 'rc_refresh';
const COOKIE_PATH = '/api/v1/auth';

/**
 * A second, non-secret cookie mirroring "does this browser have an active
 * session" — Path=/ (unlike rc_refresh, which is deliberately scoped to
 * /api/v1/auth so it's never sent on ordinary page/API requests). This is
 * what lets the Next.js edge middleware (apps/web/middleware.ts) redirect
 * signed-out visitors away from protected routes: it can't read the httpOnly
 * refresh cookie (by design — its narrow Path keeps it off arbitrary
 * requests), and the access token lives in JS memory only, so this hint
 * cookie is the only session signal middleware has. It carries no
 * privilege — real authorization is still enforced per-request by the API's
 * guards; a forged/stale value here only affects which page the browser is
 * routed to, not what it can do.
 */
const SESSION_HINT_COOKIE_NAME = 'rc_has_session';

export interface RefreshCookieOptions {
  /** Whether this is a "remember me" login. Persistent cookie (maxAge set,
   * survives browser close) when true; session cookie (no maxAge, browser
   * clears it on close) when false. */
  rememberMe: boolean;
  /** Must match the refresh token row's actual DB expiry — the cookie's
   * maxAge is a client-side hint, not the source of truth, but keeping them
   * in sync avoids a stale-looking cookie outliving (or expiring well
   * before) the token it carries. */
  expiresAt: Date;
}

/**
 * Sets the httpOnly refresh token cookie.
 * Attributes per 06_Authentication_Authorization_RBAC.md §2 and 16_Security_Guidelines.md §4:
 *   - httpOnly: not accessible by JS (XSS mitigation)
 *   - Secure: HTTPS only (except in test env)
 *   - SameSite: 'strict' by default (CSRF mitigation); configurable to 'none' for
 *     cross-domain prod deployments (web + API on different registrable domains)
 *   - Path=/api/v1/auth: scoped so it isn't sent to every request
 *   - maxAge only set for "remember me" — otherwise a session cookie so it's
 *     cleared when the browser closes, matching the short server-side TTL.
 */
export function setRefreshCookie(
  res: Response,
  token: string,
  configService: ConfigService,
  { rememberMe, expiresAt }: RefreshCookieOptions,
): void {
  const isProduction = configService.get<string>('app.env') !== 'development' &&
    configService.get<string>('app.env') !== 'test';

  // 'strict' is correct when web + API share a registrable domain.
  // Use 'none' (requires Secure) only when they are on different domains.
  const sameSite =
    (configService.get<string>('auth.cookieSameSite') as 'strict' | 'lax' | 'none') ??
    'strict';
  const domain = configService.get<string>('auth.cookieDomain') || undefined;

  const maxAge = rememberMe ? Math.max(0, expiresAt.getTime() - Date.now()) : undefined;

  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction || sameSite === 'none', // SameSite=None requires Secure
    sameSite,
    path: COOKIE_PATH,
    domain,
    // Omitting maxAge makes this a session cookie. Only give it a lifetime
    // for "remember me", and derive it from the same expiresAt the DB row
    // uses so the two can't drift apart.
    ...(maxAge !== undefined ? { maxAge } : {}),
  });

  // Non-httpOnly, Path=/ mirror so the web app's edge middleware can tell
  // "signed in" from "signed out" without ever seeing the refresh token
  // itself. Same persistence policy (session vs "remember me") as above.
  res.cookie(SESSION_HINT_COOKIE_NAME, '1', {
    httpOnly: false,
    secure: isProduction || sameSite === 'none',
    sameSite,
    path: '/',
    domain,
    ...(maxAge !== undefined ? { maxAge } : {}),
  });
}

export function clearRefreshCookie(res: Response, configService: ConfigService): void {
  // Clearing a cookie requires matching domain/path or the browser won't find it —
  // must mirror whatever setRefreshCookie used.
  const sameSite =
    (configService.get<string>('auth.cookieSameSite') as 'strict' | 'lax' | 'none') ??
    'strict';
  const domain = configService.get<string>('auth.cookieDomain') || undefined;

  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    sameSite,
    path: COOKIE_PATH,
    domain,
  });
  res.clearCookie(SESSION_HINT_COOKIE_NAME, {
    httpOnly: false,
    sameSite,
    path: '/',
    domain,
  });
}

export function getRefreshTokenFromCookie(req: { cookies?: Record<string, string> }): string | undefined {
  return req.cookies?.[REFRESH_COOKIE_NAME];
}
