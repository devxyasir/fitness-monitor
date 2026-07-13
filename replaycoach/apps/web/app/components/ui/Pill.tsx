import type { ReactNode } from 'react';

type PillVariant = 'live' | 'scheduled' | 'ended' | 'replay' | 'invited' | 'inactive' | 'active';

interface PillProps {
  variant: PillVariant;
  children: ReactNode;
  pulse?: boolean;
  className?: string;
}

const variantClasses: Record<PillVariant, string> = {
  live: 'bg-live/10 text-live border-live/30',
  active: 'bg-live/10 text-live border-live/30',
  scheduled: 'bg-brand-indigo/10 text-brand-indigo border-brand-indigo/30',
  invited: 'bg-brand-indigo/10 text-brand-indigo border-brand-indigo/30',
  ended: 'bg-hairline text-ink-muted',
  inactive: 'bg-hairline text-ink-muted',
  replay: 'bg-replay/10 text-replay border-replay/30',
};

export function Pill({ variant, children, pulse, className = '' }: PillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${variantClasses[variant]} ${className}`}
    >
      {pulse && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      )}
      {children}
    </span>
  );
}
