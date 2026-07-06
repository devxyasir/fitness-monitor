'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.push('/login');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-brand-indigo/30 border-t-brand-indigo rounded-full animate-spin" />
        <div className="text-ink-muted text-sm">Redirecting...</div>
      </div>
    </div>
  );
}
