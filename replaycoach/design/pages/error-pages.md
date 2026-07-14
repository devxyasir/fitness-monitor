# Error / Not-Found / Redirect Pages

Covers `apps/web/app/not-found.tsx`, `apps/web/app/error.tsx`, and
`apps/web/app/dashboard/page.tsx` (auth-role redirect). Lowest priority in
the build order — quick retint pass, no structural changes, no domain
accent (neutral global chrome, same as auth).

## `not-found.tsx`

```tsx
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas text-ink p-6">
      <div className="text-center max-w-md">
        <Logomark className="w-6 h-6 text-ink-faint mx-auto mb-4" />
        <div className="font-mono text-xs text-brand uppercase tracking-widest mb-3">404</div>
        <h1 className="font-display text-display-m text-ink mb-3">Page not found</h1>
        <p className="text-ink-muted text-sm mb-6 leading-relaxed">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Button href="/">Back to home</Button>
      </div>
    </div>
  );
}
```

Only change from today's implementation: the `Logomark` addition above the
"404" eyebrow (today has no brand mark on this page at all — a small,
free addition that ties the error state back to the product identity) and
the token renames (`text-brand-violet`→`text-brand`).

## `error.tsx`

```tsx
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[error-boundary]', error); }, [error]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas text-ink p-6">
      <div className="text-center max-w-md">
        <IconBadge icon={AlertTriangle} tone="danger" />
        <h1 className="font-display text-display-m text-ink mb-3">An unexpected error occurred</h1>
        <p className="text-ink-muted text-sm mb-6 leading-relaxed">
          The team has been notified. You can try again or return to the dashboard.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button href="/" variant="ghost">Back to home</Button>
        </div>
      </div>
    </div>
  );
}
```

Reuses `IconBadge` from `session-join.md` (already defined there as a
shared pattern) instead of today's bare eyebrow-text treatment — gives this
page the same visual weight as the session-room's own error states, which
is appropriate since a global error boundary can fire from any page
including mid-session.

## `dashboard/page.tsx` (redirect-only)

```tsx
<div className="min-h-screen flex items-center justify-center bg-canvas">
  <div className="flex flex-col items-center gap-4">
    <div className="w-10 h-10 border-4 border-brand/25 border-t-brand rounded-full animate-spin" />
    <div className="text-ink-muted text-sm">Redirecting...</div>
  </div>
</div>
```

Token rename only (`border-brand-indigo/30`→`border-brand/25`,
`border-t-brand-indigo`→`border-t-brand`) — this page has no other content,
it redirects immediately based on role.

## States

These pages *are* states (404, error-boundary, loading-redirect) — no
further loading/error/empty sub-states apply within them.

## Responsive

All three are already single, centered, `max-w-md` blocks — correct at
every viewport width, no changes needed.

## Backend/data

None.
