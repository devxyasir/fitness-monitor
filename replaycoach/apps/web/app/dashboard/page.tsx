'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthStore } from '../../stores/auth-store';
import { PageLoader } from '../components/ui/PageLoader';

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

  return <PageLoader label="Redirecting" />;
}
