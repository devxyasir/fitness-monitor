import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';

const REFRESH_COOKIE_NAME = 'rc_refresh';
const COOKIE_PATH = '/api/v1/auth';

/**
 * Sets the httpOnly refresh token cookie.
 * Attributes per 06_Authentication_Authorization_RBAC.md §2 and 16_Security_Guidelines.md §4:
 *   - httpOnly: not accessible by JS (XSS mitigation)
 *   - Secure: HTTPS only (except in test env)
 *   - SameSite: 'strict' by default (CSRF mitigation); configurable to 'none' for
 *     cross-domain prod deployments (web + API on different registrable domains)
 *   - Path=/auth/refresh: scoped so it isn't sent to every request
 */
export function setRefreshCookie(
  res: Response,
  token: string,
  configService: ConfigService,
): void {
  const isProduction = configService.get<string>('app.env') !== 'development' &&
    configService.get<string>('app.env') !== 'test';

  // 'strict' is correct when web + API share a registrable domain.
  // Use 'none' (requires Secure) only when they are on different domains.
  const sameSite =
    (configService.get<string>('auth.cookieSameSite') as 'strict' | 'lax' | 'none') ??
    'strict';
  const domain = configService.get<string>('auth.cookieDomain') || undefined;

  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction || sameSite === 'none', // SameSite=None requires Secure
    sameSite,
    path: COOKIE_PATH,
    domain,
    maxAge,
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
}

export function getRefreshTokenFromCookie(req: { cookies?: Record<string, string> }): string | undefined {
  return req.cookies?.[REFRESH_COOKIE_NAME];
}
