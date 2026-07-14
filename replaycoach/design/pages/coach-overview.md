# Coach Overview (`apps/web/app/(dashboard)/coach/page.tsx`)

## Purpose

The coach's daily landing page: at-a-glance stats, two trend charts, live/
upcoming sessions, recent clips. This page already fetches real data (wired
earlier today via `GET /dashboard/coach/overview`) — this doc is a pure
retint/retype/recompose, no data-layer changes.

Domain accent: **`color-analytics`** (ochre) — this is the one page in the
app where that accent should visually dominate (stat cards, chart bars,
range-selector active state).

## Layout

Unchanged section order: range selector → stat row → two-column
(charts + live/clips rail). Retint every occurrence below.

### Range selector → real Tabs component

Replace the current inline pill-button-group with `Tabs` from
`DESIGN_SYSTEM.md` §8.9 (this was flagged in `IMPLEMENTATION_NOTES.md` as a
plain-buttons-pretending-to-be-tabs pattern to upgrade):

```tsx
<div className="flex justify-end">
  <Tabs
    items={[{ key: '7d', label: '7d' }, { key: '30d', label: '30d' }, { key: '90d', label: '90d' }]}
    active={range}
    onChange={(k) => setRange(k as typeof range)}
  />
</div>
```

### Stat row

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  <StatCard accent="analytics" label="Sessions hosted" value={String(stats.sessionsHosted)} sparkData={sessionsOverTime} sparkColor="chart-ochre" />
  <StatCard accent="analytics" label="Active students" value={String(stats.activeStudents)} />
  <StatCard accent="session" label="Avg telemetry accuracy" value={`${stats.avgTelemetryAccuracy}%`} sparkData={studentFormTrends} sparkColor="chart-petrol" />
  <StatCard accent="replay" label="Replay clips saved" value={String(stats.replayClipsSaved)} />
</div>
```

`StatCard` — extract from the current inline `StatCard` function into a
shared component (it's reused verbatim on `student-overview.md` too):

```tsx
function StatCard({ accent, label, value, sparkData, sparkColor }: {
  accent: 'brand' | 'session' | 'analytics' | 'replay';
  label: string;
  value: string;
  sparkData?: number[];
  sparkColor?: string;
}) {
  const delta = computeWeekDelta(sparkData); // unchanged logic from today's implementation
  return (
    <Card accent={accent}>
      <div className="text-xs text-ink-muted mb-2 pl-2">{label}</div>
      <div className="flex items-end justify-between gap-2.5 pl-2">
        <div className="font-mono font-medium text-lg text-ink">{value}</div>
        {sparkData && sparkData.some((v) => v > 0) && (
          <Sparkline data={sparkData} color={`var(--${sparkColor ?? 'chart-ochre'})`} />
        )}
      </div>
      {delta && (
        <div className={`flex items-center gap-1.5 mt-2 pl-2 font-mono text-xs ${delta.positive ? 'text-success' : 'text-danger'}`}>
          {delta.positive ? '▲' : '▼'} {delta.label} <span className="text-ink-faint font-sans">vs prior week</span>
        </div>
      )}
    </Card>
  );
}
```

Note the `pl-2` on inner content — `Card`'s `accent` prop renders a left-edge
bar (§8.2) that needs 8px of clearance so it doesn't collide with the label
text.

### Charts

`WeeklyBarChart` (built today) keeps its structure, retints bar fill from
the old indigo/violet gradient to the chart-palette tokens per
`DESIGN_SYSTEM.md` §1.4 — sessions chart uses `chart-ochre`, telemetry
chart uses `chart-petrol` (these are the two chart-order-1/2 equivalents
for this specific pairing, chosen to match each stat's accent above):

```tsx
<div className="bg-panel border border-hairline rounded-md p-5">
  <div className="flex justify-between items-center mb-3.5">
    <h2 className="font-display text-display-s text-ink">Sessions over time</h2>
    <span className="font-mono text-xs text-ink-faint">sessions / week</span>
  </div>
  <div className="bg-panel-2 rounded-sm p-4 min-h-32 flex items-center">
    {loading ? <SkeletonRows count={1} /> : (
      <ChartOrEmpty data={sessionsOverTime.filter(v => v > 0)}>
        <WeeklyBarChart data={sessionsOverTime} color="rgb(var(--chart-ochre))" />
      </ChartOrEmpty>
    )}
  </div>
</div>
```

(Same structure repeats for the "Student form trends" card with
`chart-petrol` and `studentFormTrends` — use `ChartOrEmpty` from
`DESIGN_SYSTEM.md` §1.4 in both, replacing today's manual
`.every(v => v === 0)` conditional with the shared component.)

### Live & upcoming rail

```tsx
<div className="bg-panel border border-hairline rounded-md p-5">
  <h2 className="font-display text-display-s text-ink mb-3.5">Live & upcoming</h2>
  {liveSessions.length === 0 ? (
    <StateBlock icon={<CalendarDays className="w-full h-full" />} title="No live sessions right now" body="Sessions you start or that are scheduled soon will show up here." />
  ) : (
    <div className="flex flex-col gap-2.5">
      {liveSessions.map((s) => (
        <div key={s.id} className="flex items-center justify-between gap-2.5 bg-success/5 border border-success/20 rounded-sm px-3 py-2.5">
          <div>
            <Pill variant="success" pulse>{s.status}</Pill>
            <div className="text-sm font-medium text-ink mt-1">{s.title}</div>
          </div>
          <Button href={`/session/${s.id}`} size="sm" variant="session">Join</Button>
        </div>
      ))}
    </div>
  )}
  <Button variant="ghost" className="mt-3.5 w-full">Start instant room</Button>
</div>
```

### Recent clips rail

```tsx
<div className="bg-panel border border-hairline rounded-md p-5">
  <h2 className="font-display text-display-s text-ink mb-3.5">Recent clips</h2>
  {recentClips.length === 0 ? (
    <StateBlock icon={<Film className="w-full h-full" />} title="No clips yet" body="Save a replay from a live room to see it here." />
  ) : (
    <div className="flex flex-col gap-3">
      {recentClips.map((c) => (
        <Link key={c.id} href="/coach/clips" className="flex gap-2.5 items-center text-ink hover:text-ink-muted transition-colors">
          <div className="w-16 h-11 rounded-sm bg-panel-2 border border-hairline flex-shrink-0 relative overflow-hidden">
            <div className="absolute left-0 right-0 bottom-0.5 h-0.5 bg-replay/30" />
            <div className="absolute left-[40%] bottom-0 w-0.5 h-1.5 bg-replay" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium truncate">{c.title}</div>
            <div className="font-mono text-xs text-replay">{c.timecode}</div>
          </div>
        </Link>
      ))}
    </div>
  )}
</div>
```

## States

- **Loading:** stat row → 4× `SkeletonRows`-style shimmer blocks (already
  present today as `animate-shimmer` divs, keep that exact pattern, just
  retint the shimmer gradient stops to `panel-2`/`panel`). Charts → single
  `SkeletonRows count={1}` block inside the existing chart container so
  layout doesn't shift when data arrives.
- **Error:** today's implementation already renders `error` as a plain red
  `<div>` above the stat row (wired earlier today alongside the real-data
  fetch) — swap that inline markup for `ErrorBlock` (§9) and add
  `onRetry={fetchOverview}`, which isn't there yet.
- **Empty:** each rail (`liveSessions`, `recentClips`) has its own
  `StateBlock` shown above — already present today as plain text, upgrade
  to the shared component + real icon.
- **Zero-result:** N/A — no filtering/search on this page.

## Responsive

`grid-cols-1 lg:grid-cols-[1.6fr_1fr]` main split, `sm:grid-cols-2
lg:grid-cols-4` stat row — both unchanged from current structure, already
correct.

## Backend/data

No changes — `GET /dashboard/coach/overview` already returns everything
this doc uses (`stats`, `sessionsOverTime`, `studentFormTrends`,
`liveSessions`, `recentClips`), wired earlier today.
