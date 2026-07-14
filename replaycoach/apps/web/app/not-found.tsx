import { Button } from './components/ui/Button';
import { Logomark } from './components/Logomark';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas text-ink p-6">
      <div className="text-center max-w-md">
        <Logomark className="w-6 h-6 text-ink-faint mx-auto mb-4" />
        <div className="font-mono text-xs text-brand uppercase tracking-widest mb-3">404</div>
        <h1 className="font-display text-display-m text-ink mb-3">Page not found</h1>
        <p className="text-ink-muted text-sm mb-6 leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Button href="/">Back to home</Button>
      </div>
    </div>
  );
}
