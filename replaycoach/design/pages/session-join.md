# Session Join / Lobby (`apps/web/app/session/join/[id]/page.tsx`)

## Purpose

The invite-link landing page: verify the invite, show the athlete what
they're joining, request access (or enter directly for public-access
sessions), and hold in a real-time lobby if the coach gates entry.

**This page currently has zero design-token migration** — every class is a
raw Tailwind default (`bg-slate-950`, `border-slate-800`, `text-indigo-400`,
`bg-red-950`, etc.), left over from before any token system existed. Treat
this as a from-scratch build against the tokens below, not a re-skin.

## Layout

Single centered card on `bg-canvas`, same shell shape across all five states
(loading / unauthenticated / error / pending-lobby / rejected / join-prompt)
— extract the repeated wrapper into a local helper so the five states don't
re-duplicate the outer markup:

```tsx
function JoinShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-canvas text-ink p-6">
      <div className="max-w-md w-full bg-panel border border-hairline rounded-lg shadow-lg p-8 text-center animate-rise">
        {children}
      </div>
    </div>
  );
}
```

### Loading

```tsx
<JoinShell>
  <div className="w-12 h-12 border-4 border-brand/25 border-t-brand rounded-full animate-spin mx-auto mb-4" />
  <p className="text-sm font-semibold text-ink-muted">Verifying invite link...</p>
</JoinShell>
```

### Unauthenticated

```tsx
<JoinShell>
  <IconBadge icon={Lock} tone="brand" />
  <h2 className="font-display text-display-s text-ink mb-2">Sign in required</h2>
  <p className="text-ink-muted text-sm mb-6">You must be signed in to join coaching sessions on ReplayCoach.</p>
  <Button href={`/login?redirect=/session/join/${inviteCode}`} className="w-full">Sign in & join session</Button>
</JoinShell>
```

`IconBadge` — small shared helper for the recurring "icon in a soft-tinted
circle at the top of a state card" pattern (this is a **legitimate** use of
an icon-in-circle, distinct from the forbidden "3× feature list" pattern
because it's a single status indicator, not a repeated grid formula):

```tsx
function IconBadge({ icon: Icon, tone }: { icon: typeof Lock; tone: 'brand' | 'danger' | 'replay' | 'success' }) {
  return (
    <div className={`w-16 h-16 bg-${tone}/10 border border-${tone}/30 rounded-full flex items-center justify-center mx-auto mb-6 text-${tone}`}>
      <Icon className="w-7 h-7" />
    </div>
  );
}
```

### Error / invite not found

```tsx
<JoinShell>
  <IconBadge icon={AlertTriangle} tone="danger" />
  <h2 className="font-display text-display-s text-ink mb-2">Invite error</h2>
  <p className="text-ink-muted text-sm mb-6">{error || 'Unable to retrieve session invitation details.'}</p>
  <Button href="/dashboard" variant="ghost" className="w-full">Return to dashboard</Button>
</JoinShell>
```

### Pending (waiting for coach approval)

```tsx
<JoinShell>
  <div className="relative">
    <div className="absolute -top-8 left-0 right-0 h-1 bg-replay animate-pulse" aria-hidden />
    <IconBadge icon={Hourglass} tone="replay" />
  </div>
  <h2 className="font-display text-display-s text-ink mb-2">Waiting for approval</h2>
  <p className="text-ink-muted text-sm mb-6">
    The coach has been notified of your request to join. Keep this tab open —
    you'll enter the room automatically once they approve you.
  </p>
  <div className="flex justify-center gap-2 mb-6" aria-hidden>
    <span className="w-2.5 h-2.5 rounded-full bg-replay animate-bounce [animation-delay:-0.3s]" />
    <span className="w-2.5 h-2.5 rounded-full bg-replay animate-bounce [animation-delay:-0.15s]" />
    <span className="w-2.5 h-2.5 rounded-full bg-replay animate-bounce" />
  </div>
  <Button href="/dashboard" variant="ghost" size="sm" className="w-full" onClick={() => disconnectSocket()}>
    Cancel request & exit
  </Button>
</JoinShell>
```

### Rejected

```tsx
<JoinShell>
  <IconBadge icon={Ban} tone="danger" />
  <h2 className="font-display text-display-s text-ink mb-2">Access declined</h2>
  <p className="text-ink-muted text-sm mb-6">Your request to join this session has been declined by the coach.</p>
  <Button href="/dashboard" variant="ghost" className="w-full">Return to dashboard</Button>
</JoinShell>
```

### Join prompt (default)

```tsx
<JoinShell>
  <IconBadge icon={Clapperboard} tone="session" />
  <h2 className="font-display text-display-s text-ink mb-1">Session invitation</h2>
  <p className="text-xs text-ink-faint font-mono mb-6">{session.id}</p>

  <div className="bg-panel-2 border border-hairline rounded-sm p-4 text-left mb-6 flex flex-col gap-2.5">
    <div className="flex justify-between items-center text-xs">
      <span className="text-ink-muted">Security gate</span>
      <Pill variant={session.accessType === 'lobby' ? 'replay' : 'success'}>
        {session.accessType === 'lobby' ? 'Lobby approval needed' : 'Anyone can join'}
      </Pill>
    </div>
    <div className="h-px bg-hairline" />
    <div className="flex justify-between items-center text-xs">
      <span className="text-ink-muted">Current status</span>
      <span className="text-ink capitalize">{session.status}</span>
    </div>
  </div>

  <Button onClick={handleJoin} loading={joinStatus === 'joining'} className="w-full">
    {joinStatus === 'joining' ? 'Requesting access...' : 'Request to join room'}
  </Button>
</JoinShell>
```

`session` (petrol) tone on the `Clapperboard` badge here is deliberate — this
is the one non-dashboard, non-marketing page that's genuinely part of the
"live session" domain (it's the front door to the session room), so it
borrows `color-session` rather than `color-brand`.

## States

All five states are shown above — this page's states *are* its content, not
an addition to a "happy path." No separate loading skeleton is needed
beyond the spinner shown (a single spinner is correct here, not a violation
of the "real skeleton, not spinner-only" rule in `DESIGN_SYSTEM.md` §9 —
that rule is about content-shaped loading placeholders for lists/cards; a
single centered verification step is legitimately spinner-appropriate).

## Responsive

Already single-column, already constrained to `max-w-md` — no breakpoint
changes needed at any width.

## Backend/data

None — this page's data flow (fetch by invite code, join/request, socket
listeners for `lobby_approved`/`lobby_rejected`) is unchanged and correct.
Markup/token changes only.
