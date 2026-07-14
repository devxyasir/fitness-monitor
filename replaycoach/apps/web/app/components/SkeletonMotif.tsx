const TONE_CLASSES = {
  brand: 'text-brand',
  session: 'text-session',
} as const;

/**
 * The shared decorative joint-tracking motif — same flat, no-glow visual
 * language as the live SkeletonOverlay canvas drawing (see
 * app/session/[id]/components/SkeletonOverlay.tsx), as static SVG for
 * marketing/auth-page use. design/DESIGN_SYSTEM.md "signature motif".
 */
export function SkeletonMotif({
  className,
  jointColor = 'session',
}: {
  className?: string;
  jointColor?: keyof typeof TONE_CLASSES;
}) {
  return (
    <svg
      viewBox="0 0 220 260"
      className={`${TONE_CLASSES[jointColor]} ${className ?? ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden
    >
      <line x1="110" y1="30" x2="110" y2="90" />
      <line x1="110" y1="45" x2="70" y2="70" />
      <line x1="70" y1="70" x2="55" y2="115" />
      <line x1="110" y1="45" x2="150" y2="70" />
      <line x1="150" y1="70" x2="165" y2="115" />
      <line x1="110" y1="90" x2="80" y2="150" />
      <line x1="80" y1="150" x2="75" y2="210" />
      <line x1="110" y1="90" x2="140" y2="150" />
      <line x1="140" y1="150" x2="145" y2="210" />
      <g fill="currentColor" stroke="none">
        <circle cx="110" cy="30" r="7" />
        <circle cx="110" cy="45" r="2" />
        <circle cx="70" cy="70" r="2" />
        <circle cx="150" cy="70" r="2" />
        <circle cx="55" cy="115" r="2" />
        <circle cx="165" cy="115" r="2" />
        <circle cx="110" cy="90" r="2" />
        <circle cx="80" cy="150" r="2" />
        <circle cx="140" cy="150" r="2" />
        <circle cx="75" cy="210" r="2" />
        <circle cx="145" cy="210" r="2" />
      </g>
    </svg>
  );
}
