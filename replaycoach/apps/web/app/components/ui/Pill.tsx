import type { ReactNode } from 'react';

type PillVariant = 'success' | 'scheduled' | 'ended' | 'replay' | 'danger';

interface PillProps {
  variant: PillVariant;
  children: ReactNode;
  pulse?: boolean;
  className?: string;
}

const variantClasses: Record<PillVariant, string> = {
  success: 'bg-success/10 text-success border-success/30',
  scheduled: 'bg-analytics/10 text-analytics border-analytics/30',
  ended: 'bg-hairline text-ink-muted',
  replay: 'bg-replay/10 text-replay border-replay/30',
  danger: 'bg-danger/10 text-danger border-danger/30',
};

export function Pill({ variant, children, pulse, className = '' }: PillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${variantClasses[variant]} ${className}`}
    >
      {pulse && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" aria-hidden />}
      {children}
    </span>
  );
}
