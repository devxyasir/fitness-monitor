'use client';

import type { ComponentProps, ElementType, ReactNode } from 'react';

/** Empty / zero-result state — one shared shape, different icon/copy per page. */
export function StateBlock({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-16 border border-dashed border-hairline rounded-md">
      <div className="w-10 h-10 mx-auto mb-4 text-ink-faint" aria-hidden>
        {icon}
      </div>
      <h3 className="font-display text-display-s text-ink mb-2">{title}</h3>
      <p className="text-sm text-ink-muted max-w-sm mx-auto mb-6">{body}</p>
      {action}
    </div>
  );
}

/** Content-shaped loading placeholder — real skeleton, not a spinner-only block. */
export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-14 rounded-md animate-shimmer bg-[length:200%_100%] bg-gradient-to-r from-panel-2 via-panel to-panel-2"
        />
      ))}
    </div>
  );
}

/** Card-grid loading placeholder — same shimmer, aspect-video shaped. */
export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="aspect-video rounded-md animate-shimmer bg-[length:200%_100%] bg-gradient-to-r from-panel-2 via-panel to-panel-2"
        />
      ))}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="bg-danger/10 border border-danger/30 text-danger rounded-md px-4 py-3 text-sm flex items-center justify-between gap-3 animate-rise">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="text-xs font-semibold underline decoration-dotted hover:text-ink transition-colors flex-shrink-0">
          Retry
        </button>
      )}
    </div>
  );
}

/** Wraps a chart: renders the empty state in the same bounding box instead
 * of an empty axis grid or a flat line at zero, so layout doesn't jump when
 * data arrives. */
export function ChartOrEmpty({ data, children }: { data: unknown[]; children: ReactNode }) {
  if (data.length === 0) {
    return (
      <div className="h-full min-h-32 flex items-center justify-center rounded-md bg-panel-2 w-full">
        <span className="text-sm text-ink-faint">No data for this period yet</span>
      </div>
    );
  }
  return <>{children}</>;
}

const BADGE_TONE_CLASSES = {
  brand: 'bg-brand/10 border-brand/30 text-brand',
  session: 'bg-session/10 border-session/30 text-session',
  analytics: 'bg-analytics/10 border-analytics/30 text-analytics',
  success: 'bg-success/10 border-success/30 text-success',
  danger: 'bg-danger/10 border-danger/30 text-danger',
  replay: 'bg-replay/10 border-replay/30 text-replay',
  neutral: 'bg-panel-2 border-hairline text-ink-muted',
} as const;

/** Single status icon in a soft-tinted circle — the top of a state card
 * (join/error/ended screens). Not the forbidden icon-in-circle pattern,
 * which is specifically about repeated 3-up feature grids, not a single
 * status indicator. */
export function IconBadge({ icon: Icon, tone }: { icon: ElementType<ComponentProps<'svg'>>; tone: keyof typeof BADGE_TONE_CLASSES }) {
  return (
    <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 border ${BADGE_TONE_CLASSES[tone]}`}>
      <Icon className="w-7 h-7" />
    </div>
  );
}
