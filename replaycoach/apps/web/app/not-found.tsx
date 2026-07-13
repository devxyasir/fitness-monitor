import Link from 'next/link';
import { Button } from './components/ui/Button';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas text-ink p-6">
      <div className="text-center max-w-md">
        <div className="font-mono text-xs text-brand-violet uppercase tracking-widest mb-3">404</div>
        <h1 className="font-display text-2xl font-bold mb-3">Page not found</h1>
        <p className="text-ink-muted text-sm mb-6 leading-relaxed">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link href="/">
          <Button>Back to home</Button>
        </Link>
      </div>
    </div>
  );
}
