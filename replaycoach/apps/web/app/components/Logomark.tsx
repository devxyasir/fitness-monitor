export function Logomark({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none" />
      <path d="M6 20l6-11 6 11" />
    </svg>
  );
}
