# Coach Clips (`apps/web/app/(dashboard)/coach/clips/page.tsx` + `components/{ClipCard,ClipPlaybackModal,MeetingGroups,clipsShared}.tsx`)

## Purpose

Browse clips grouped by meeting, play one in a modal, share with students,
download (with the full-skeleton-vs-annotations-only choice built earlier
today — keep that logic exactly as-is, it's correct). Domain accent:
**`color-session`** (petrol) — clips are session-room output, not a
dashboard stat, so they borrow the live-session domain identity rather than
`analytics`.

## Layout

Page shell unchanged (header + `MeetingGroups` grid + `ClipPlaybackModal` +
share modal + loading overlay). This page and its four components were
**partially** migrated earlier today (`ClipCard`, `ClipPlaybackModal`
retinted to the old indigo/violet tokens) — re-retint those to the new
tokens below, and **fully migrate `MeetingGroups.tsx`'s header**, which was
missed in the earlier pass and is still raw `slate-900`/`indigo-950`.

### `MeetingGroups.tsx` header — the actual gap to fix

```tsx
<div className="flex items-center gap-3 mb-4 pb-3 border-b border-hairline">
  <div className="w-9 h-9 rounded-md bg-session/10 border border-session/25 flex items-center justify-center shrink-0">
    <Calendar className="w-4 h-4 text-session" />
  </div>
  <div className="min-w-0">
    <h3 className="font-display text-display-s text-ink truncate">{group.otherParticipantName}</h3>
    <p className="text-xs text-ink-muted">{formatMeetingDateTime(group.startedAt)}</p>
  </div>
  <span className="ml-auto font-mono text-[10px] font-semibold text-ink-faint bg-panel-2 border border-hairline rounded-md px-2 py-1 shrink-0">
    {group.clips.length} clip{group.clips.length === 1 ? '' : 's'}
  </span>
</div>
```

### `ClipCard.tsx` — retint pass (structure already correct)

Swap `border-brand-indigo/25` hover → `border-session/25`; play-button
circle fill `bg-gradient-to-br from-brand-indigo to-brand-violet` → flat
`bg-session`; title hover color `group-hover:text-brand-violet` →
`group-hover:text-session`; Share button fill → `bg-brand` (sharing is a
brand-level action, not session-domain, since it's about distribution not
playback — deliberate accent choice, not an oversight).

### `ClipPlaybackModal.tsx` — retint pass

Download-mode-chooser buttons ("Full skeleton" / "Annotations only", built
earlier today) swap from `bg-brand-indigo/15` / plain `bg-panel-2` to
`bg-session/15 text-session border-session/40` (full skeleton — it's
literally the session-tracking visual) and keep annotations-only as neutral
`bg-panel-2` (already correct, no change needed there). Speed-selector
active state and the "Annotations: ON" toggle swap their indigo→violet
gradient fill for flat `bg-brand`.

### Share modal

Retint only — `bg-canvas/80` overlay unchanged, swap the header/close-button
tokens to `ink`/`ink-muted`, unchanged structurally otherwise (already has
`role="dialog"`/`aria-label`/close-button `aria-label` from earlier today's
accessibility pass — keep all of that).

## States

- **Loading (initial clip list fetch):** today shows nothing extra during
  `loading` — the grid is just empty until data arrives. Add
  `SkeletonRows count={4}` (rendered as a `grid grid-cols-1 md:grid-cols-2
  lg:grid-cols-3 gap-6` of shimmer blocks matching `ClipCard`'s aspect
  ratio, not the default row shape — see note below).
- **Loading (fetching signed play URL):** existing full-screen overlay
  spinner (`fixed inset-0 ... bg-canvas/70`) — keep this one as a spinner,
  it's a brief modal-opening transition, not a content list.
- **Error:** clip-list fetch error → `ErrorBlock` with retry (today already
  renders `error` as a plain red div, verified — swap for the shared
  component + add `onRetry={fetchClips}`, not present today).
  Download/share/stream errors already route through the shared toast
  system (`stores/toast-store.ts`, built earlier today) — no change needed,
  toasts are correct here regardless of visual theme.
- **Empty:** no clips at all — `StateBlock` with `Film` icon, copy:
  "No clips yet — save a replay from a live room to see it here," no action
  button (a coach can't create a clip from this page, only from the session
  room).
- **Zero-result:** N/A — no search/filter UI exists on this page.

Skeleton-grid variant (for the card-grid loading case specifically, since
the default `SkeletonRows` from §9 is row-shaped, not card-shaped):

```tsx
function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="aspect-video bg-panel-2 rounded-md animate-shimmer bg-[length:200%_100%] bg-gradient-to-r from-panel-2 via-panel to-panel-2" />
      ))}
    </div>
  );
}
```

## Responsive

`grid-cols-1 md:grid-cols-2 lg:grid-cols-3` clip grid — unchanged, already
correct.

## Backend/data

None — clip list/share/download/export all already wired correctly
(including today's `referenceVideoId`-based re-export flow). Markup/token
changes only.
