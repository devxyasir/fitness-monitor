# Student Overview (`apps/web/app/(dashboard)/student/page.tsx`)

## Purpose

Simpler than the coach overview: sessions attended, next session, clips
shared, recent sessions list. Real data already wired (`GET
/dashboard/student/overview`, built earlier today) — retint/retype only.

Domain accent: **`color-analytics`** (same as coach overview — both are
dashboard/stats pages, same domain), with the "next session" card using
**`color-success`** since it's specifically a live/upcoming-action card, not
a passive stat.

## Layout

```tsx
<div className="space-y-6">
  {error && <ErrorBlock message={error} onRetry={fetchOverview} />}

  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
    <Card accent="analytics">
      <div className="text-xs text-ink-muted mb-2 pl-2">Sessions attended</div>
      <div className="font-mono font-medium text-lg text-ink pl-2">{loading ? '—' : stats?.sessionsAttended ?? 0}</div>
    </Card>

    <Card accent="success" className="bg-success/5 border-success/20">
      <div className="text-xs text-ink-muted mb-2">Next session</div>
      {loading ? (
        <SkeletonRows count={1} />
      ) : stats?.nextSession ? (
        <>
          <div className="text-sm font-semibold text-ink">{stats.nextSession.time}</div>
          <Button href={`/session/${stats.nextSession.sessionId}`} variant="session" size="sm" className="mt-2">Join</Button>
        </>
      ) : (
        <div className="text-sm text-ink-muted">No upcoming sessions</div>
      )}
    </Card>

    <Card accent="analytics">
      <div className="text-xs text-ink-muted mb-2 pl-2">Clips shared with you</div>
      <div className="font-mono font-medium text-lg text-ink pl-2">{loading ? '—' : stats?.clipsShared ?? 0}</div>
    </Card>
  </div>

  <div className="bg-panel border border-hairline rounded-md p-5">
    <h2 className="font-display text-display-s text-ink mb-4">Recent sessions</h2>
    {loading ? (
      <SkeletonRows count={3} />
    ) : recentSessions.length === 0 ? (
      <StateBlock icon={<CalendarDays className="w-full h-full" />} title="No sessions yet" body="Your coach will invite you to one." />
    ) : (
      <div className="flex flex-col">
        {recentSessions.map((s) => (
          <div key={s.id} className="flex justify-between items-center py-3 border-b border-hairline last:border-0">
            <span className="text-sm text-ink">{s.title}</span>
            <span className="font-mono text-xs text-ink-faint">{s.date}</span>
          </div>
        ))}
      </div>
    )}
  </div>
</div>
```

Note the "Next session" card uses the raw `bg-success/5 border-success/20`
override on top of `Card`'s `accent="success"` left-bar — this is the one
stat card in the app that gets a full tinted background rather than just
the edge bar, because it's the single most action-oriented item on this
page (unlike the coach overview, which has a whole separate live-sessions
rail for that purpose, this page needs the one "next session" card to carry
that weight visually).

## States

- **Loading:** `SkeletonRows` in both the "next session" card and the
  recent-sessions list — today's implementation uses a plain `Loading...`
  text string + `—` placeholders for the two numeric stats; upgrade both to
  real skeletons.
- **Error:** `ErrorBlock` with Retry — today's implementation already
  renders `error` (a plain red `<div>`, wired earlier today alongside the
  real-data fetch), just swap that inline markup for the shared
  `ErrorBlock` component and add the `onRetry={fetchOverview}` action,
  which the current version doesn't have.
- **Empty:** "No upcoming sessions" (inline text, already present, keep)
  and the `StateBlock` for recent sessions (currently plain centered text +
  icon, upgrade to shared component).
- **Zero-result:** N/A.

## Responsive

`sm:grid-cols-3` stat row, single column below `sm` — unchanged, already
correct at this simple a layout.

## Backend/data

None needed beyond what's already wired. One fix flagged above: surface the
`error` state that's currently captured but never rendered.
