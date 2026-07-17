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
    const staysVisibleWhenAuthed = pathname === '/' || isInviteRoute;
    const isPublicRoute = pathname === '/login' || pathname === '/register' || staysVisibleWhenAuthed;
    const isOrgOnboardingRoute = pathname === '/onboarding/organization';

    if (!accessToken && !isPublicRoute) {
      router.push(`/login?redirectTo=${encodeURIComponent(pathname)}`);
    } else if (accessToken && isPublicRoute && !staysVisibleWhenAuthed) {
      if (user?.role === 'student') {
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
