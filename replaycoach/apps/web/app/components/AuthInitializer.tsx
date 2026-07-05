'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { authClient } from '../../lib/auth-client';
import { useAuthStore } from '../../stores/auth-store';

export default function AuthInitializer({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [initializing, setInitializing] = useState(true);
  const { accessToken, user } = useAuthStore();

  useEffect(() => {
    async function restoreSession() {
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
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-200">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-indigo-400 rounded-full animate-spin"></div>
          <p className="text-sm font-semibold tracking-wide animate-pulse">Initializing ReplayCoach...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
