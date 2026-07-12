import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * Mirrors apps/api/src/auth/cookie.helper.ts's SESSION_HINT_COOKIE_NAME.
 * Non-httpOnly, Path=/, carries no privilege (just "1") — set/cleared
 * alongside the real httpOnly refresh cookie on login/refresh/logout. It
 * exists purely so this edge middleware has *something* to check: the real
 * refresh token is httpOnly and deliberately scoped to /api/v1/auth (never
 * sent on page requests), and the access token lives in JS memory only, so
 * neither is visible here.
 */
const SESSION_HINT_COOKIE = 'rc_has_session';

/**
 * Route auth guard.
 * IMPORTANT: This is a UX convenience only — frontend guards are NOT the security boundary.
 * Server-side authorization is always enforced per request (every API guard
 * re-validates the access token and re-checks role/ownership regardless of
 * what this middleware decided). A forged/missing hint cookie can only send
 * a visitor to the wrong page, never grant or withhold real access.
 * See 13_Frontend_Architecture.md §5 and 06_Authentication_Authorization_RBAC.md.
 */
export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_HINT_COOKIE);

  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Match dashboard and session routes only — skip static assets and API routes
  matcher: [
    '/coach/:path*',
    '/student/:path*',
    '/dashboard/:path*',
    '/session/:path*',
    '/admin/:path*'
  ],
};
