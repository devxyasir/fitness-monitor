# Platform Admin (`apps/web/app/admin/page.tsx`)

## Purpose

Platform-admin-only overview: total users/sessions/orgs, active sessions,
quick links to user/org management. Lowest-traffic page in the app
(internal tooling), lowest priority in the build order per
`IMPLEMENTATION_NOTES.md`. Domain accent: **`color-analytics`** (it's a
stats page).

## Real data gap (flagged, not fixed by this redesign)

Three of the four stats are hardcoded to `0` regardless of actual platform
state (`totalSessions`, `totalOrgs`, `activeSessions` — only `totalUsers` is
real, from `users.length`). The two "Quick Actions" links
(`/admin/users`, `/admin/orgs`) point to routes that don't exist in the app.
Per `IMPLEMENTATION_NOTES.md`'s scope guardrails, wiring real endpoints for
the other three stats and building the two missing routes is **out of
scope** for this presentation-layer redesign — implement the visual spec
below against whatever data shape currently exists (including the fake
zeros), and leave a `// DEVIATION:` or `// TODO:` comment at the stat block
noting these three are not yet real, so a future session can pick this up
without re-discovering it.

## Layout

```tsx
<div className="space-y-6">
  <div>
    <h1 className="font-display text-display-m text-ink">Platform admin</h1>
    <p className="text-sm text-ink-muted mt-1">Overview and management</p>
  </div>

  {error && <ErrorBlock message={error} onRetry={fetchStats} />}

  {loading ? (
    <SkeletonRows count={2} />
  ) : stats && (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <AdminStatCard icon={Users} label="Total users" value={stats.totalUsers} />
      <AdminStatCard icon={Calendar} label="Total sessions" value={stats.totalSessions} />
      <AdminStatCard icon={Shield} label="Organizations" value={stats.totalOrgs} />
      <AdminStatCard icon={Activity} label="Active sessions" value={stats.activeSessions} />
    </div>
  )}

  <div className="bg-panel border border-hairline rounded-md p-6">
    <h2 className="font-display text-display-s text-ink mb-4">Quick actions</h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <AdminActionLink label="Manage users" icon={Users} href="/admin/users" />
      <AdminActionLink label="Manage organizations" icon={Shield} href="/admin/orgs" />
    </div>
  </div>
</div>
```

```tsx
function AdminStatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <Card accent="analytics" className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-md bg-analytics/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-analytics" />
      </div>
      <div>
        <div className="text-xl font-mono font-bold text-ink">{value}</div>
        <div className="text-xs text-ink-muted">{label}</div>
      </div>
    </Card>
  );
}

function AdminActionLink({ label, icon: Icon, href }: { label: string; icon: typeof Users; href: string }) {
  return (
    <a href={href} className="flex items-center gap-3 p-4 rounded-sm bg-panel-2 hover:bg-panel-2/70 transition-colors border border-hairline">
      <Icon className="w-5 h-5 text-ink-muted" />
      <span className="text-sm font-medium text-ink">{label}</span>
    </a>
  );
}
```

This is the one legitimate icon-in-a-square (not circle, and not a
repeated 3-up feature-list formula) pattern reuse in the app — acceptable
here because it's a real stat card convention consistent with
`coach-overview.md`'s `StatCard`, not decorative filler.

## States

- **Loading:** `SkeletonRows count={2}` in place of today's centered
  `Loader2` spinner + "Loading dashboard..." text.
- **Error:** today already renders `error` as a plain red div — swap for
  `ErrorBlock` + `onRetry={fetchStats}`.
- **Empty:** N/A — stats always render (as zeros if no data), there's no
  meaningful "empty" distinct from the loading/loaded states here.
- **Zero-result:** N/A.

## Responsive

`sm:grid-cols-2 lg:grid-cols-4` stat row, `sm:grid-cols-2` action grid —
unchanged, already correct at this simple a layout.

## Backend/data

Flagged above — no changes made as part of this redesign, three stats stay
hardcoded to `0` and the two admin sub-routes stay unbuilt. Leave a
`// TODO:` comment, don't silently build the missing routes.
