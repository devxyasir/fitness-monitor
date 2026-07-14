import { Logomark } from '../Logomark';

export function PageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-canvas text-ink">
      <div className="flex flex-col items-center gap-5">
        <Logomark className="w-8 h-8 text-brand animate-mark-breathe" />
        <div className="flex items-center gap-1.5" role="status" aria-label={label}>
          <span className="w-2 h-2 rounded-full bg-brand animate-dot-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-brand animate-dot-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-brand animate-dot-bounce" style={{ animationDelay: '300ms' }} />
        </div>
        <p className="font-mono text-xs text-ink-faint uppercase tracking-widest">{label}</p>
      </div>
    </div>
  );
}
