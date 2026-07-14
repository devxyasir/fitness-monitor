'use client';

/**
 * Small representative product mockups for the landing page — built from
 * the same tokens/components as the live app rather than screenshot files,
 * per design/DESIGN_SYSTEM.md §7.1 method 1. Purely illustrative, no data.
 */

import { useState } from 'react';

/** Real sourced photography (§7.1 method 4, design/ASSET_SOURCES.md).
 * Falls back to a flat bg-panel-2 fill instead of a broken-image icon
 * until the manually-sourced file exists at `src`. */
export function BandPhoto({
  src,
  alt,
  className = '',
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div className={`bg-panel-2 ${className}`} aria-hidden />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} onError={() => setFailed(true)} className={`object-cover ${className}`} />
  );
}

const STAT_ACCENT_CLASSES = {
  session: 'text-session',
  replay: 'text-replay',
  analytics: 'text-analytics',
} as const;

export function StatStrip() {
  const stats: { value: string; label: string; accent: keyof typeof STAT_ACCENT_CLASSES }[] = [
    { value: '<150ms', label: 'Overlay latency, live', accent: 'session' },
    { value: '30s', label: 'Always-buffered replay window', accent: 'replay' },
    { value: '33', label: 'Tracked joints per athlete', accent: 'analytics' },
  ];
  return (
    <div className="grid grid-cols-3 gap-4 sm:gap-8">
      {stats.map((s) => (
        <div key={s.label}>
          <div className={`font-mono text-2xl sm:text-display-m ${STAT_ACCENT_CLASSES[s.accent]}`}>{s.value}</div>
          <div className="text-ink-faint text-xs sm:text-sm mt-1 leading-snug">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

export function JointReadout() {
  return (
    <div className="flex gap-2 mt-4 flex-wrap">
      {[
        { joint: 'HIP_R', value: '168°' },
        { joint: 'KNEE_L', value: '142°' },
      ].map((r) => (
        <span
          key={r.joint}
          className="font-mono text-[11px] text-ink-muted bg-panel-2 border border-hairline rounded-full px-2.5 py-1"
        >
          {r.joint} <span className="text-session">{r.value}</span>
        </span>
      ))}
    </div>
  );
}

export function ReplayScrubberMini({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-panel-2 border border-hairline rounded-sm p-3 ${className}`}>
      <div className="relative h-1 bg-replay/15 rounded-full mb-2">
        <div className="absolute left-0 top-0 bottom-0 w-[38%] bg-replay/40 rounded-full" />
        <div className="absolute left-[38%] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-replay" />
      </div>
      <div className="flex justify-between font-mono text-xs text-replay">
        <span>◍ 00:11.4 / 00:30.0</span>
        <span className="text-ink-faint">0.5×</span>
      </div>
    </div>
  );
}

export function RoomsGridMini({ className = 'mt-4 w-32' }: { className?: string }) {
  const initials = ['P', 'J', 'M', 'A'];
  return (
    <div className={`grid grid-cols-2 gap-1.5 ${className}`}>
      {initials.map((initial, i) => (
        <div
          key={initial}
          className={`aspect-square rounded-sm border flex items-center justify-center font-mono text-xs ${
            i === 0 ? 'bg-analytics/15 border-analytics/40 text-analytics' : 'bg-panel-2 border-hairline text-ink-faint'
          }`}
        >
          {initial}
        </div>
      ))}
    </div>
  );
}

export function LiveTile() {
  return (
    <div className="relative w-full max-w-[220px] aspect-video bg-panel-2 border border-hairline rounded-md overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="w-10 h-10 text-ink-faint/40" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden>
          <circle cx="12" cy="8" r="3" />
          <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
        </svg>
      </div>
      <div className="absolute top-2 left-2 flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-session animate-ping opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-session" />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-session">Live</span>
      </div>
    </div>
  );
}

export function AnnotationDrawDemo() {
  return (
    <svg
      viewBox="0 0 220 130"
      className="w-full max-w-[220px] aspect-video bg-panel-2 border border-hairline rounded-md"
      fill="none"
      aria-hidden
    >
      <rect x="10" y="10" width="200" height="110" rx="6" className="stroke-hairline" strokeWidth="1" />
      <path
        d="M35 95 Q 70 40 110 60 T 190 35"
        className="stroke-brand animate-stroke-draw"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="160"
      />
      <circle cx="35" cy="95" r="3" className="fill-brand" />
    </svg>
  );
}
