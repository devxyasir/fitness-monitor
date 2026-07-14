# Coach Sessions (`apps/web/app/(dashboard)/coach/sessions/page.tsx`)

## Purpose

Create/manage coaching sessions: instant-create, copy invite link, stop a
live session, jump into replay or clips for an ended one. Domain accent:
**`color-analytics`** (this is a management/data table, same domain family
as the overview pages) with **`color-success`** reserved for the live "Join
Room" action specifically.

## Layout

Top bar (title + refresh/create actions) → table (desktop) / card list
(mobile), both already structurally present and correct — retint only.

```tsx
<div className="space-y-6">
  <div className="flex items-center justify-between gap-4 flex-wrap">
    <div>
      <h2 className="font-display text-display-m text-ink">Coaching sessions</h2>
      <p className="text-xs text-ink-muted mt-1">Create, join, or review your live coaching sessions.</p>
    </div>
    <div className="flex items-center gap-3">
      <Button variant="ghost" size="sm" onClick={fetchSessions}>Refresh</Button>
      <Button size="sm" loading={creating} onClick={handleCreateSession}>+ New session</Button>
    </div>
  </div>

  {error && <ErrorBlock message={error} onRetry={fetchSessions} />}

  {loading ? (
    <SkeletonRows count={5} />
  ) : sessions.length === 0 ? (
    <StateBlock
      icon={<CalendarDays className="w-full h-full" />}
      title="No sessions yet"
      body="Create an instant live room and share the link with your students."
      action={<Button loading={creating} onClick={handleCreateSession}>+ Create your first session</Button>}
    />
  ) : (
    <SessionsTable sessions={sessions} {...handlers} />
  )}
</div>
```

### `SessionsTable` (desktop) — table pattern from `DESIGN_SYSTEM.md` §8.7

```tsx
<table className="w-full text-left text-sm">
  <thead>
    <tr className="border-b border-hairline bg-panel-2 text-label text-ink-faint uppercase">
      <th className="px-5 py-3">Room</th>
      <th className="px-5 py-3">Access</th>
      <th className="px-5 py-3">Status</th>
      <th className="px-5 py-3">Scheduled</th>
      <th className="px-5 py-3 text-right">Actions</th>
    </tr>
  </thead>
  <tbody className="divide-y divide-hairline">
    {sessions.map((session) => (
      <tr key={session.id} className="hover:bg-panel-2/40 transition-colors">
        <td className="px-5 py-3.5 font-mono text-xs text-ink">{session.id.substring(0, 8)}...</td>
        <td className="px-5 py-3.5 text-xs font-semibold capitalize text-ink-muted">{session.accessType ?? 'public'}</td>
        <td className="px-5 py-3.5"><Pill variant={statusPillVariant(session.status)}>{session.status}</Pill></td>
        <td className="px-5 py-3.5 text-xs text-ink-muted">{new Date(session.scheduledAt).toLocaleString()}</td>
        <td className="px-5 py-3.5">
          <div className="flex justify-end items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => handleCopyLink(session)}>
              {copiedSessionId === session.id ? <><Check className="w-3 h-3" /> Copied</> : 'Copy invite'}
            </Button>
            {['live', 'scheduled'].includes(session.status) ? (
              <>
                <Button variant="danger" size="sm" onClick={() => handleStopSession(session.id)}>Stop</Button>
                <Button variant="session" size="sm" href={`/session/${session.id}`}>Join room</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" href={`/session/${session.id}?replay=true`}>Replay</Button>
                <Button variant="analytics" size="sm" href={`/coach/clips?sessionId=${session.id}`}>Clips</Button>
              </>
            )}
          </div>
        </td>
      </tr>
    ))}
  </tbody>
</table>
```

`statusPillVariant` mapping updates for the renamed Pill variants (§8.4):
`live` → `'success'`, `scheduled` → `'scheduled'` (unchanged name, now
ochre/`analytics`-tinted per the Pill component's new color mapping),
anything else → `'ended'`.

Mobile card list: same field set, stacked — structurally unchanged from
today's `md:hidden` block, retint tokens only (already uses `Pill`, just
needs the variant rename above).

## States

- **Loading:** `SkeletonRows count={5}` — replaces today's centered
  spinner-only loading state (`w-8 h-8 ... animate-spin` + text), which is
  exactly the "spinner-only placeholder" pattern `DESIGN_SYSTEM.md` §9
  says to avoid in favor of content-shaped skeletons.
- **Error:** today already renders `error` as a plain red div — swap for
  `ErrorBlock` + `onRetry={fetchSessions}` (not present today).
- **Empty:** `StateBlock` with the create-session action — today's version
  already has equivalent copy/CTA, just needs the shared component +
  `CalendarDays` icon token retint.
- **Zero-result:** N/A — no filtering on this page.

## Responsive

`hidden md:block` table / `md:hidden` card list — unchanged split, already
correct.

## Backend/data

None — `GET /sessions`, `POST /sessions`, `PATCH /sessions/:id/status` all
already power this page correctly.
