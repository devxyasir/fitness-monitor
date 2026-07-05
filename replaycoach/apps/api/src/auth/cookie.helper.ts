import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';

const REFRESH_COOKIE_NAME = 'rc_refresh';
const COOKIE_PATH = '/api/v1/auth';

/**
 * Sets the httpOnly refresh token cookie.
 * Attributes per 06_Authentication_Authorization_RBAC.md §2 and 16_Security_Guidelines.md §4:
 *   - httpOnly: not accessible by JS (XSS mitigation)
 *   - Secure: HTTPS only (except in test env)
 *   - SameSite=Strict: CSRF mitigation
 *   - Path=/auth/refresh: scoped so it isn't sent to every request
 */
export function setRefreshCookie(
  res: Response,
  token: string,
  configService: ConfigService,
): void {
  const isProduction = configService.get<string>('app.env') !== 'development' &&
    configService.get<string>('app.env') !== 'test';

  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: COOKIE_PATH,
    maxAge,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'strict',
    path: COOKIE_PATH,
  });
}

export function getRefreshTokenFromCookie(req: { cookies?: Record<string, string> }): string | undefined {
  return req.cookies?.[REFRESH_COOKIE_NAME];
}
