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

    const isPublicRoute = pathname === '/login' || pathname === '/register' || pathname === '/';

    if (!accessToken && !isPublicRoute) {
      router.push(`/login?redirectTo=${encodeURIComponent(pathname)}`);
    } else if (accessToken && isPublicRoute) {
      if (user?.role === 'student') {
        router.push('/student/sessions');
      } else {
        router.push('/coach/sessions');
      }
    }
  }, [accessToken, user, pathname, initializing, router]);

  if (initializing) {
    return <PageLoader label="Loading ReplayCoach" />;
  }

  return <>{children}</>;
}
