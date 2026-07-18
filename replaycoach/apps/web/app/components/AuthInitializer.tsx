'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { authClient } from '../../lib/auth-client';
import { useAuthStore } from '../../stores/auth-store';
import { PageLoader } from './ui/PageLoader';

export default function AuthInitializer({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [initializing, setInitializing] = useState(true);
  const { accessToken, user } = useAuthStore();

  useEffect(() => {
    async function restoreSession() {
      // rc_has_session (non-httpOnly, mirrors the real refresh cookie — see
      // apps/api/src/auth/cookie.helper.ts) lets us skip the round trip
      // entirely for a visitor who was never logged in, instead of always
      // firing a refresh call that's guaranteed to 401.
      const hasSessionHint = document.cookie.includes('rc_has_session=');
      if (!hasSessionHint) {
        setInitializing(false);
        return;
      }
      try {
        await authClient.refresh();
      } catch (err) {
        console.warn('Session restoration failed:', err);
      } finally {
        setInitializing(false);
      }
    }
    restoreSession();
  }, []);

  useEffect(() => {
    if (initializing) return;

    // /invite/* and / (the landing page) are public — a visitor with no
    // account yet must be able to see them — but, unlike /login and
    // /register, an already-authenticated visitor stays on them too. Forcing
    // a redirect away from "/" the instant a token exists raced the
    // session-restore render (a slow/failed refresh could leave the visitor
    // stuck on the logged-out header instead of retrying) — the landing
    // page's header just reflects current auth state reactively instead.
    const isInviteRoute = pathname?.startsWith('/invite/') ?? false;
    // /admin/login is the dedicated admin entry point — never force a
    // redirect away from it (an authenticated non-admin can still see the
    // form; the page itself and the backend both reject non-admin
    // credentials). The rest of /admin/* is handled by AdminAuthGuard, not
    // this generic redirect — it only needs to know where to SEND an
    // unauthenticated visitor (see below), not gate it here too.
    const isAdminLoginRoute = pathname === '/admin/login';
    const isAdminRoute = pathname?.startsWith('/admin') ?? false;
    const staysVisibleWhenAuthed = pathname === '/' || isInviteRoute || isAdminLoginRoute;
    const isPublicRoute = pathname === '/login' || pathname === '/register' || staysVisibleWhenAuthed;
    const isOrgOnboardingRoute = pathname === '/onboarding/organization';

    if (!accessToken && !isPublicRoute) {
      const loginPath = isAdminRoute ? '/admin/login' : '/login';
      router.push(`${loginPath}?redirectTo=${encodeURIComponent(pathname)}`);
    } else if (accessToken && isPublicRoute && !staysVisibleWhenAuthed) {
      // platform_admin has no coach/student dashboard of its own — the
      // (dashboard) layout actively rejects that role now, but this
      // redirect target needs to agree with that or it'd send an admin
      // straight into the page whose own guard immediately bounces them
      // back out again.
      if (user?.role === 'platform_admin') {
        router.push('/admin');
      } else if (user?.role === 'student') {
        router.push('/student/sessions');
      } else {
        router.push('/coach/sessions');
      }
    } else if (
      accessToken &&
      !isOrgOnboardingRoute &&
      !staysVisibleWhenAuthed &&
      (user?.role === 'coach' || user?.role === 'studio_admin') &&
      user?.orgId === null
    ) {
      // A coach/studio_admin with no organization yet can't do anything
      // useful in the dashboard — every screen assumes org context. Force
      // the one-time "name your organization" step before anything else.
      router.push('/onboarding/organization');
    }
  }, [accessToken, user, pathname, initializing, router]);

  if (initializing) {
    return <PageLoader label="Loading LetsMove" />;
  }

  return <>{children}</>;
}
