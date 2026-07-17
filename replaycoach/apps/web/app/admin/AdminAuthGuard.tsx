'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../stores/auth-store';
import { PageLoader } from '../components/ui/PageLoader';

/**
 * Real route protection for /admin/* — unlike the rest of the app, which
 * relies on the edge middleware's session-hint cookie (a UX convenience,
 * not a security boundary — see middleware.ts) plus the backend's 403,
 * this actually blocks rendering client-side before any admin content or
 * API call happens. AuthInitializer has already run by the time this
 * mounts (root layout order), so `user` here reflects the restored session.
 */
export function AdminAuthGuard({ children }: { children: ReactNode }) {
  const { user, accessToken } = useAuthStore();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // AuthInitializer's session-restore is async — give it one tick before
    // deciding "not logged in" is final, rather than bouncing a
    // still-restoring admin straight back to the login page.
    const timer = setTimeout(() => setChecked(true), 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!checked) return;
    if (!accessToken || !user) {
      router.replace('/admin/login');
      return;
    }
    if (user.role !== 'platform_admin') {
      router.replace('/admin/login?denied=1');
    }
  }, [checked, accessToken, user, router]);

  if (!checked || !accessToken || !user || user.role !== 'platform_admin') {
    return <PageLoader />;
  }

  return <>{children}</>;
}
