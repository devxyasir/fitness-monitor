import type { ReactNode } from 'react';

type CardAccent = 'brand' | 'session' | 'analytics' | 'success' | 'danger' | 'replay';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  /** Category-coded left-edge bar tying the card to a domain/semantic
   * accent — omit for neutral content cards (settings, plain lists). */
  accent?: CardAccent;
}

const ACCENT_CLASSES: Record<CardAccent, string> = {
  brand: 'bg-brand',
  session: 'bg-session',
  analytics: 'bg-analytics',
  success: 'bg-success',
  danger: 'bg-danger',
  replay: 'bg-replay',
};

export function Card({ children, className = '', onClick, accent }: CardProps) {
  const interactive = Boolean(onClick);
  return (
    <div
      onClick={onClick}
      className={`relative bg-panel border border-hairline rounded-md p-6 shadow-sm ${
        interactive ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-150' : ''
      } ${className}`}
    >
      {accent && <span aria-hidden className={`absolute left-0 top-4 bottom-4 w-[3px] rounded-full ${ACCENT_CLASSES[accent]}`} />}
      {children}
    </div>
  );
}
