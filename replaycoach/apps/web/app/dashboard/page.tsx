'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthStore } from '../../stores/auth-store';

export default function DashboardRedirectPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  useEffect(() => {
    if (user?.role === 'student') {
      router.push('/student/sessions');
    } else {
      router.push('/coach/sessions');
    }
  }, [user, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="text-zinc-500 text-sm animate-pulse">Redirecting...</div>
    </div>
  );
}
