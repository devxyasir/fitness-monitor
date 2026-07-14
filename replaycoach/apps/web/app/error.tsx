'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './components/ui/Button';
import { IconBadge } from './components/ui/StateBlocks';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[error-boundary]', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas text-ink p-6">
      <div className="text-center max-w-md">
        <IconBadge icon={AlertTriangle} tone="danger" />
        <h1 className="font-display text-display-m text-ink mb-3">An unexpected error occurred</h1>
        <p className="text-ink-muted text-sm mb-6 leading-relaxed">
          The team has been notified. You can try again or return to the dashboard.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button href="/" variant="ghost">Back to home</Button>
        </div>
      </div>
    </div>
  );
}
