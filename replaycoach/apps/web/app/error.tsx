'use client';

import { useEffect } from 'react';
import { Button } from './components/ui/Button';
import Link from 'next/link';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[error-boundary]', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas text-ink p-6">
      <div className="text-center max-w-md">
        <div className="font-mono text-xs text-brand-violet uppercase tracking-widest mb-3">Something went wrong</div>
        <h1 className="font-display text-2xl font-bold mb-3">An unexpected error occurred</h1>
        <p className="text-ink-muted text-sm mb-6 leading-relaxed">
          The team has been notified. You can try again or return to the dashboard.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Link href="/">
            <Button variant="ghost">Back to home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
