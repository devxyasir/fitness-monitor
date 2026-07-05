'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.push('/login');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="text-zinc-500 text-sm animate-pulse">Redirecting...</div>
    </div>
  );
}
