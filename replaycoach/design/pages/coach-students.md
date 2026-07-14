# Coach Students (`apps/web/app/(dashboard)/coach/students/page.tsx`)

## Purpose

Roster of students the coach has actually run a session with (fixed from a
broken `/users`-endpoint 403 earlier today — `GET /dashboard/coach/students`
now powers this correctly; that data layer is done, this doc is retint
only). Domain accent: **`color-analytics`** (it's a management/data table,
same family as sessions/overview).

## Layout

```tsx
<div className="space-y-6">
  <div className="flex items-center justify-between flex-wrap gap-3">
    <div>
      <h1 className="font-display text-display-m text-ink">Students</h1>
      <p className="text-sm text-ink-muted mt-1">Everyone you've run a coaching session with.</p>
    </div>
    <div className="flex items-center gap-3">
      <Button variant="ghost" size="sm" onClick={fetchStudents} aria-label="Refresh"><RefreshCw className="w-4 h-4" /></Button>
      <Button href="/invite" size="sm"><UserPlus className="w-4 h-4" /> Invite student</Button>
    </div>
  </div>

  {error && <ErrorBlock message={error} onRetry={fetchStudents} />}

  {loading ? (
    <SkeletonRows count={5} />
  ) : students.length === 0 ? (
    <StateBlock
      icon={<Users className="w-full h-full" />}
      title="No students yet"
      body="Invite students to join your coaching sessions. They'll appear here once they've been in a session with you."
      action={<Button href="/invite"><UserPlus className="w-4 h-4" /> Invite your first student</Button>}
    />
  ) : (
    <StudentsTable students={students} />
  )}
</div>
```

### `StudentsTable`

```tsx
<table className="w-full text-left text-sm">
  <thead>
    <tr className="border-b border-hairline bg-panel-2 text-label text-ink-faint uppercase">
      <th className="px-4 py-3">Student</th>
      <th className="px-4 py-3">Status</th>
      <th className="px-4 py-3">Sessions</th>
      <th className="px-4 py-3">Last session</th>
    </tr>
  </thead>
  <tbody className="divide-y divide-hairline">
    {students.map((s) => (
      <tr key={s.id} className="hover:bg-panel-2/40 transition-colors">
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-analytics flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-white dark:text-canvas">
                {s.displayName?.charAt(0)?.toUpperCase() || s.email.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <div className="text-ink font-medium truncate">{s.displayName || 'Unnamed'}</div>
              <div className="text-xs text-ink-faint flex items-center gap-1 truncate">
                <Mail className="w-3 h-3 flex-shrink-0" /> {s.email}
              </div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <Pill variant={s.status === 'active' ? 'success' : s.status === 'pending' ? 'replay' : 'ended'}>{s.status}</Pill>
        </td>
        <td className="px-4 py-3 text-ink-muted font-mono">{s.sessionsCount}</td>
        <td className="px-4 py-3 text-ink-muted">
          <div className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {s.lastSessionAt ? new Date(s.lastSessionAt).toLocaleDateString() : 'Never'}</div>
        </td>
      </tr>
    ))}
  </tbody>
</table>
```

Avatar circle: flat `bg-analytics` fill (replaces the indigo→violet
gradient built earlier today) — same `dark:text-canvas` pattern as
`DESIGN_SYSTEM.md` §8.1's button note, since it needs the same
white-on-light-theme / canvas-on-dark-theme text swap.

## States

- **Loading:** `SkeletonRows count={5}` — today shows a centered spinner +
  "Loading students..." text (spinner-only pattern, replace with skeleton
  rows shaped like table rows: `h-14` blocks work fine here, same helper
  as `DESIGN_SYSTEM.md` §9).
- **Error:** today already renders `error` as a plain red div (verified,
  line 75) — swap for `ErrorBlock` + `onRetry={fetchStudents}`.
- **Empty:** today already has equivalent copy/CTA in a plain centered
  block — swap for `StateBlock`.
- **Zero-result:** N/A — no search/filter on this table currently.

## Responsive

Table has no `md:hidden` mobile-card fallback today (unlike the sessions
pages) — at narrow widths it currently just horizontally scrolls inside the
`bg-panel` container. That's acceptable for a 4-column table (unlike the
5-column sessions table with an actions column, this one has no interactive
per-row controls to cram into a mobile card), so no change needed here —
just ensure the table's parent has `overflow-x-auto` if it doesn't already.

## Backend/data

None — `GET /dashboard/coach/students` (built earlier today) already
returns everything this doc uses.
