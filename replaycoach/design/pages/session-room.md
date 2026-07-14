# Session Room (`apps/web/app/session/[id]/page.tsx` + `components/*.tsx`)

## Purpose

The core product surface: live video grid, DVR replay, joint-tracked
annotations. Domain accent: **`color-session`** (petrol) throughout — this
is the one page where that accent should feel dominant, the way
`color-analytics` dominates the dashboard pages.

**Scope guardrail, repeated from `IMPLEMENTATION_NOTES.md` because it matters
most here:** every hook (`useLiveKitRoom`, `useReplaySocket`,
`usePoseOverlay`, `useSessionRoom`, `useAnnotationTrackingSocket`,
`useReferenceSocketListeners`), every socket event, every LiveKit
`<LiveKitRoom>` prop, and all state/effects in every file below are
untouched by this doc. Only JSX markup/className and the `SkeletonOverlay`
canvas-drawing color values change.

## The signature motif — replaces the neon-glow skeleton

The old system drew skeleton overlays with a `shadowBlur`/`drop-shadow` neon
glow effect (indigo→violet gradient stroke + glow). That glow treatment is
explicitly retired — it's a generic "AI dashboard" tell. The new treatment:
**thin, flat `color-session` stroke, small solid joint dots, zero glow/blur.**
Confident and legible instead of decorative.

### `SkeletonOverlay.tsx` (live canvas overlay) — full replacement

```tsx
// Reads the session-domain accent from the CSS custom property so it
// automatically follows the active theme (dark vs. light) without a
// separate light/dark branch in the drawing code.
function getSessionAccent(): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--color-session').trim();
  return `rgb(${raw})`;
}

// Inside the existing draw effect, replacing the old gradient+glow block:
const strokeColor = getSessionAccent();
ctx.lineWidth = 1.5;
ctx.lineCap = 'round';
ctx.strokeStyle = strokeColor;
// No ctx.shadowBlur / ctx.shadowColor — flat, no glow.

for (const conn of connections) {
  const kpA = orderedKps[conn[0]];
  const kpB = orderedKps[conn[1]];
  if (!kpA || !kpB || kpA.score < 0.3 || kpB.score < 0.3) continue;
  ctx.globalAlpha = Math.min(kpA.score, kpB.score);
  ctx.beginPath();
  ctx.moveTo(kpA.x * width, kpA.y * height);
  ctx.lineTo(kpB.x * width, kpB.y * height);
  ctx.stroke();
}

ctx.globalAlpha = 1.0;
ctx.fillStyle = strokeColor;
for (let i = 0; i < orderedKps.length; i++) {
  const kp = orderedKps[i];
  if (!kp || kp.score < 0.3) continue;
  const isHead = HEAD_KEYPOINT_NAMES.has(names[i]!);
  ctx.beginPath();
  ctx.arc(kp.x * width, kp.y * height, isHead ? 6 : 2.25, 0, Math.PI * 2);
  ctx.fill();
}
```

Everything else in this file (the `usePoseStore` subscription, canvas
sizing effect, confidence threshold, format detection) is unchanged.

### `SkeletonMotif` — the shared decorative/marketing version

Landing and auth (`landing.md`, `auth.md`) both reference a static
`SkeletonMotif` component for hero art and watermarks. Same visual language
as the live overlay above, as static SVG instead of canvas:

```tsx
// app/components/SkeletonMotif.tsx
export function SkeletonMotif({ className, jointColor = 'session' }: { className?: string; jointColor?: 'brand' | 'session' }) {
  const cls = `text-${jointColor}`;
  return (
    <svg viewBox="0 0 220 260" className={`${cls} ${className}`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <line x1="110" y1="30" x2="110" y2="90" /><line x1="110" y1="45" x2="70" y2="70" /><line x1="70" y1="70" x2="55" y2="115" />
      <line x1="110" y1="45" x2="150" y2="70" /><line x1="150" y1="70" x2="165" y2="115" />
      <line x1="110" y1="90" x2="80" y2="150" /><line x1="80" y1="150" x2="75" y2="210" />
      <line x1="110" y1="90" x2="140" y2="150" /><line x1="140" y1="150" x2="145" y2="210" />
      <g fill="currentColor" stroke="none">
        <circle cx="110" cy="30" r="7" />
        <circle cx="110" cy="45" r="2" /><circle cx="70" cy="70" r="2" /><circle cx="150" cy="70" r="2" />
        <circle cx="55" cy="115" r="2" /><circle cx="165" cy="115" r="2" />
        <circle cx="110" cy="90" r="2" /><circle cx="80" cy="150" r="2" /><circle cx="140" cy="150" r="2" />
        <circle cx="75" cy="210" r="2" /><circle cx="145" cy="210" r="2" />
      </g>
    </svg>
  );
}
```

No glow/filter anywhere — flat `currentColor`, theme-reactive automatically
since `text-session`/`text-brand` are token classes.

## Layout — main shell (`page.tsx`)

### Header

```tsx
<header className="flex items-center justify-between flex-wrap gap-2 px-3 sm:px-6 py-3 bg-panel/85 backdrop-blur-md border-b border-hairline z-10">
  <div className="flex items-center gap-3">
    <div className={`w-2.5 h-2.5 rounded-full ${mode === 'playing' ? 'bg-replay animate-pulse' : 'bg-success animate-pulse'}`} />
    <h1 className="text-sm font-semibold text-ink flex items-center gap-2 flex-wrap">
      <span>Session: {sessionId.substring(0, 8)}</span>
      {elapsedLabel && <span className="text-[10px] font-mono text-ink-faint bg-panel-2 border border-hairline px-2 py-0.5 rounded tabular-nums">{elapsedLabel}</span>}
      {isCoach && <RecordingStatusIndicator />}
      {mode === 'playing' && <Pill variant="replay">◍ DVR replay active</Pill>}
    </h1>
  </div>
  <div className="flex items-center gap-2.5">
    {isCoach && session?.inviteCode && (
      <Button variant="ghost" size="sm" onClick={handleCopyMeetingLink}>
        {linkCopied ? <><Check className="w-3.5 h-3.5 text-success" /> Copied</> : <><LinkIcon className="w-3.5 h-3.5" /> Copy link</>}
      </Button>
    )}
    <span className="bg-session/10 border border-session/30 text-session text-xs px-3 py-1.5 rounded-full font-mono font-medium inline-flex items-center gap-1.5">
      {isCoach ? <><Circle className="w-2 h-2 fill-success text-success" /> COACH</> : <><Pencil className="w-3 h-3" /> STUDENT</>}
    </span>
    <Button variant="danger" size="sm" onClick={isCoach ? () => setShowExitModal(true) : leaveAndExit}>Leave room</Button>
  </div>
</header>
```

### Floating control dock

Unchanged pill-shaped floating dock concept from the earlier build — retint
only: mic/camera/fullscreen buttons `bg-panel-2 border-hairline` (unchanged,
these are neutral toggles), replay button `bg-replay/15 border-replay/40
text-replay` (unchanged, correctly domain-locked to replay), annotate button
`bg-session/15 border-session/40 text-session` (was `bg-brand-indigo/15` —
this is a session-room action, now correctly uses the session accent
instead of the old generic brand-indigo), return-to-live button
`bg-success/90 text-canvas` (was `bg-live/90`, same token renamed), leave/end
buttons stay `bg-danger/10 border-danger/35 text-danger`.

### Exit modal, lobby panel

Both already have `role="dialog"`/`aria-modal`/`aria-label` from earlier
today's accessibility pass — keep. Retint: exit modal's "End meeting"
button `bg-danger/10 border-danger/35`, "Just leave" `bg-panel-2
border-hairline`. Lobby panel's approve/reject buttons `bg-success/10
text-success` / `bg-danger/10 text-danger` (renamed from `live`).

## `VideoGrid.tsx` / `ParticipantVideoTile`

Structure unchanged (spotlight layout, gallery grid, `rc-tile` hover-reveal
actions). Retint: tile border stays `border-hairline` at rest; the
coach-only action row (Replay / Analyze 10s / Spotlight buttons) — Replay
button `bg-panel/80 border-hairline text-ink` (neutral, unchanged), Analyze
button `bg-replay/15 border-replay/35 text-replay` (unchanged, correctly
replay-domain), Spotlight/Pin button `bg-session/15 border-session/35
text-session` (was `bg-brand-indigo/15` — this is a session-room control,
now correctly domain-accented). Participant name-label pill: unchanged
`bg-panel/70` glass treatment, `bg-success` live-dot (renamed from `bg-live`).

## `ReplayPanel.tsx` — amber DVR scrubber

Unchanged structurally (the `.rc-scrubber` custom range-input styling built
earlier today is correct and stays `color-replay`-tinted — replay UI is
explicitly exempt from the domain-accent system, it's the one
cross-cutting semantic color that stays constant everywhere per
`DESIGN_SYSTEM.md` §1.3). Retint only the non-replay chrome: play/pause
button `bg-panel-2 border-hairline text-ink` (unchanged), speed-selector
active state flat `bg-brand` (was the indigo→violet gradient — speed
control is a generic player control, not session-domain-specific, so it
gets the global brand accent rather than `color-session`), "Return to live"
button `bg-success/90 text-canvas`.

## `ReplayTargetPicker.tsx`, `RecordingStatusIndicator.tsx`, `Roster.tsx`

All three retint-only, same token renames as above (`live`→`success`,
`brand-indigo`/`brand-violet`→`session` for session-room-specific accents).
No structural changes — all three were already sound.

## `ConnectionStatusBanner.tsx` + `SocketStatusBanner.tsx`

Both built/verified correct earlier today. Retint: LiveKit quality
indicator `QUALITY_CONFIG` — excellent/good → `text-success`, poor →
`text-replay` (unchanged, connection-quality "caution" state legitimately
borrows replay's amber since it's a universally-understood caution color,
not a replay-domain violation), lost → `text-danger`. Reconnecting banners
(both LiveKit and Socket.IO variants) → `bg-replay/15 border-replay/35
text-replay` (unchanged). Socket-failed banner → `bg-danger/15
border-danger/35 text-danger` (unchanged).

## `ReferenceAnalysisModal.tsx`, `AnnotationTrackingModal.tsx`, `AnnotationCanvas.tsx`

**Chrome only** — same rule that applied during today's earlier pass:
never touch `ctx.strokeStyle`/`ctx.fillStyle` calls that use the
user-selected `color`/`activeColor` variable (the annotation color swatches
are intentionally user-configurable, not brand tokens). Retint the modal
shell (`bg-panel border-hairline`, unchanged), header badges (Analyzing →
`bg-replay/10 text-replay`, unchanged), the in-modal skeleton-preview toggle
(built earlier today with the old neon gradient+glow treatment — replace
with the same flat `color-session`, no-glow treatment as the live
`SkeletonOverlay` above, since it's the same visual object), download
mode-chooser buttons (same retint as `ClipPlaybackModal` in
`coach-clips.md`: full-skeleton → `bg-session/15 text-session`,
annotations-only → neutral `bg-panel-2`).

## `ReferenceVideoQueue.tsx`

Retint-only — status pills `success`/`danger`/`replay` token renames, play
icon `text-session` (was `text-brand-violet`).

## States

- **Loading (LiveKit token fetch):** unchanged spinner — this is a genuine
  brief connection-establishing moment, spinner-only is correct here (same
  exception noted in `session-join.md`).
- **Error (connection failed):** unchanged card structure, retint
  `IconBadge` (from `session-join.md`) tone to `danger`.
- **Session ended:** unchanged card structure, retint `IconBadge` tone to
  neutral (`bg-panel-2`/`text-ink-muted`, no accent — the session simply
  ended, that's not an error or a domain action).
- **Empty (no participants yet / connecting tile):** existing shimmer
  placeholder tile in the video grid — retint shimmer gradient stops to
  `panel-2`/`panel`, unchanged structure.

## Responsive

Existing breakpoints (`rc-video-grid` 1-col under 900px equivalent via
Tailwind `sm:`/`lg:` classes, floating dock wraps via `flex-wrap`, replay
sidebar stacks under the video on narrow viewports) are already correct —
no changes needed beyond the retint above.

## Backend/data

None — every data flow in this page (LiveKit tokens, pose overlay, replay
sync, lobby, annotations, reference videos) is unchanged and was verified
correct earlier today.
