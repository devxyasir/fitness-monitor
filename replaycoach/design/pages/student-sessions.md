# Student Sessions (`apps/web/app/(dashboard)/student/sessions/page.tsx`)

## Purpose

Read-only session history for a student: join a live/scheduled one, view
clips for an ended one. Same table pattern as `coach-sessions.md` minus the
create/manage actions. Domain accent: **`color-analytics`**.

## Layout

Near-identical structure to `coach-sessions.md` — same `SkeletonRows` /
`ErrorBlock` / `StateBlock` states, same `Pill` variant mapping, same table
shape with two fewer columns (no Access/Room-management columns, students
don't need them) and a simpler action column:

```tsx
<td className="px-5 py-3.5 text-right">
  {['live', 'scheduled'].includes(s.status) ? (
    <Button variant="session" size="sm" href={`/session/${s.id}`}>Join room</Button>
  ) : (
    <Button variant="ghost" size="sm" href={`/student/clips?sessionId=${s.id}`}>View clips</Button>
  )}
</td>
```

Header row: `Session | Status | Date | Actions` (drop the `Room`/`Access`
columns coach-sessions has — a student doesn't manage access settings).

Empty state copy differs from the coach version (no create-CTA — a student
can't start a session):

```tsx
<StateBlock
  icon={<CalendarDays className="w-full h-full" />}
  title="No active sessions found"
  body="You'll find your coaching session list here once you join a live session invitation."
/>
```

## States

Same four-state shape as `coach-sessions.md` (loading/error/empty/N/A
zero-result) — today's implementation already renders `error` correctly
(verified), just needs `ErrorBlock` + `onRetry={fetchSessions}` in place of
the current plain div, and `SkeletonRows` in place of the spinner-only
loading block.

## Responsive

`hidden md:block` / `md:hidden` split, unchanged.

## Backend/data

None — `GET /sessions` (student-scoped server-side) already powers this
correctly.
