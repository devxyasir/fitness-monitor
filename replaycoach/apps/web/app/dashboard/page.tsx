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
      router.push('/coach');
    }
  }, [user, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-brand/25 border-t-brand rounded-full animate-spin" />
        <div className="text-ink-muted text-sm">Redirecting...</div>
      </div>
    </div>
  );
}
