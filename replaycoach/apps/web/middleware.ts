import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * Route auth guard.
 * IMPORTANT: This is a UX convenience only — frontend guards are NOT the security boundary.
 * Server-side authorization is always enforced per request.
 * See 13_Frontend_Architecture.md §5 and 06_Authentication_Authorization_RBAC.md.
 *
 * Implementation: Phase 1 — replace the placeholder with real cookie/token validation.
 */
export function middleware(request: NextRequest) {
  // TODO (Phase 1): Check for a valid session cookie/token.
  // - If missing/invalid on a protected route → redirect to /login.
  // - Use a lightweight cookie check here (not a full DB call — that's for the API).

  const { pathname } = request.nextUrl;

  // Placeholder: allow all requests through (no auth yet)
  const isProtectedRoute =
    pathname.startsWith('/(dashboard)') || pathname.startsWith('/session');

  if (isProtectedRoute) {
    // TODO: redirect to /login if no valid session cookie
    void isProtectedRoute; // suppress unused var until Phase 1
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
