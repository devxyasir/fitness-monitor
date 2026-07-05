# DESIGN 04 — Live meet + DVR replay room (`/session/[id]`)

**Surface:** `app/session/[id]/page.tsx` and its components (`VideoGrid`, `SkeletonOverlay`,
`ReplayPanel`, `AnnotationCanvas`, controls).
**Depends on:** `DESIGN_00`. **Behavior is owned by the fix briefs** — build the *visual*
layer here; `fix-briefs/FIX_05` (replay buffer/overlay), `FIX_08` (end meeting), `FIX_09`
(roster), `FIX_11` (colors) handle function. Don't reimplement logic; style the real
components.

---

## 1. Goal

The core workspace: a high-end web-call room that toggles cleanly between **Live View** and
**DVR Replay View**. It should feel like Google Meet crossed with a video editor — familiar
call grid, but with the neon skeleton overlay and an amber scrubber that make replay feel
like broadcast.

## 2. Two views, one room

```
LIVE VIEW                                   REPLAY VIEW (coach hits "Replay 30s")
┌──────────────────────────────────────┐   ┌──────────────────────────────────────┐
│ ▸ header: ID · invite · ● Live · COACH│   │ ▸ header: … · ◍ REPLAY · COACH        │
├──────────────────────────────────────┤   ├───────────────────────────┬──────────┤
│  ┌────────┐ ┌────────┐                │   │   large replay player      │ sidebar  │
│  │coach   │ │student │  responsive    │   │   ── neon skeleton overlay │ students │
│  │        │ │ ╱skel╲ │  grid          │   │                            │ ☑ sync…  │
│  └────────┘ └────────┘                │   │                            │ telemetry│
│  ┌────────┐ ┌────────┐                │   │                            │ SHLDR 142°│
│  │student │ │student │                │   ├───────────────────────────┴──────────┤
│  └────────┘ └────────┘                │   │  ◍──────●───────────  amber playhead  │
│                                        │   │  ◄◄ ⏸ ►►  0.5×  |  00:12.4 / 00:30.0  │
├──────────────────────────────────────┤   ├──────────────────────────────────────┤
│      ●mic ●cam ▦layout ⟳replay  ⏻leave│   │   (same floating dock, replay-tinted) │
└──────────────────────────────────────┘   └──────────────────────────────────────┘
        floating glass pill dock                     amber accent = "in the past"
```

The whole room reads **emerald/indigo when live**, and shifts to **amber-accented** in
replay so everyone instantly knows they're watching the past, not the live feed.

## 3. Top header (slim)

`.glass`, hairline bottom. Left: session title + **session ID in mono** with a copy-invite
button. Center: a status chip — `● Live` (emerald pulse) or `◍ Replay` (amber) — and a live
participant count (from the roster, `FIX_09`). Right: a **role badge** (`COACH` gradient
outline / `STUDENT` faint) and an avatar menu. Keep it one line, quiet.

## 4. Live video grid

- Responsive grid (1 / 2 / 3+ columns by participant count), tiles with a **thin hairline
  border**, radius `md`, subtle shadow. Active speaker gets an **emerald ring** + tag.
- **Participant label:** bottom-left, on a small `.glass` chip — name (sans) + muted-mic
  icon when muted. No heavy name bars.
- **Skeleton overlay:** the signature. `SkeletonOverlay` draws joints/bones as **thin
  glowing neon lines** (indigo→violet gradient stroke, ~1.5–2px, soft `drop-shadow`), joints
  as small dots — *not* hard-colored markers. It scales with the tile and sits above the
  video (`pointer-events-none`). A per-tile toggle to hide/show the overlay.
- **Per-tile actions on hover:** pin, "Replay last 30s" (coach), overlay toggle — as small
  glass icon buttons, revealed on hover only (keep tiles clean at rest).
- States: connecting (shimmer + "Connecting…"), camera off (avatar monogram on `panel-2`),
  reconnecting (amber-free — use a neutral "Reconnecting…" glass banner so amber stays
  reserved for replay).

## 5. DVR replay view (coach triggers; everyone follows in sync)

- Main screen becomes a **large central player** showing the replayed student stream with
  the skeleton overlay; the live grid shrinks to a filmstrip or hides.
- **Playhead timeline (bottom):** an **amber** scrubber — a thin track, a round amber handle,
  buffered range subtly filled, tick marks per second. Below/beside it: transport controls
  (frame-step ◄◄ / ►►, play/pause, speed 0.5×–2×) and a **mono timecode**
  `00:12.4 / 00:30.0`. Frame-step buttons nudge one frame; the current time drives the
  skeleton overlay so pose and video stay locked (see FIX_05 sync).
- **Coach sidebar controller (`.glass`, coach-only):** a list of students with **checkboxes
  to choose who the replay syncs to**, and a **telemetry block** — mono joint-angle readouts
  for the selected frame (`SHOULDER_L 142°`, `HIP_R 168°`, …) that update as the coach
  scrubs. This is where the coaching happens.
- **Annotation:** an `AnnotationCanvas` overlay with a tiny tool cluster (pen, circle,
  arrow, color, clear) as a glass mini-dock; strokes render for everyone in sync. Keep tools
  minimal and out of the way until invoked.
- A clear **"Return to live"** button (emerald) exits replay for everyone.

## 6. Floating control dock (Meet-style)

Center-bottom **pill dock**, `.glass`, radius `pill`, soft shadow, floating with margin from
the edge. Round icon buttons: **mic**, **camera**, **layout**, **replay** (⟳), and a
**"Leave"** button in `danger`. Coach also sees **"End for everyone"** (danger, slightly
emphasized) and **"Replay 30s"** (the one amber-tinted action). Toggled-off mic/cam show a
muted state (slash + faint). Buttons have tooltips and accessible names. In replay mode the
dock stays but the replay button becomes "Return to live".

## 7. Files to touch (style, not logic)

- [ ] `app/session/[id]/page.tsx` — header, view toggle layout, dock placement
- [ ] `.../components/VideoGrid.tsx` — grid, tiles, labels, hover actions, states
- [ ] `.../components/SkeletonOverlay.tsx` — neon glowing strokes + joints
- [ ] `.../components/ReplayPanel.tsx` — large player, amber timeline, transport, coach sidebar
- [ ] `.../components/AnnotationCanvas.tsx` — minimal glass tool cluster
- [ ] a `ControlDock` component for the floating pill

## 8. Accessibility & performance

Every control has a visible focus ring + accessible name; the dock is keyboard-operable;
skeleton/annotation layers are `aria-hidden` decorative overlays; timecode is real text, not
an image; overlay rendering uses `requestAnimationFrame` and avoids per-frame allocation so
it stays smooth (pairs with FIX_05). Color is never the only signal (Live/Replay chips have
text + icon).

## 9. Do NOT touch

- Don't change replay/annotation/socket **logic** — style the existing components; behavior
  is the fix briefs' job.
- Keep the color grammar absolute: **amber only in replay**, **emerald only for live/active**
  — this is how a coach knows at a glance which reality they're in.

## 10. Acceptance criteria

- Room toggles cleanly between a Meet-style live grid and a large amber-accented DVR view.
- Skeleton overlays render as thin glowing neon lines locked to each video.
- Replay has an amber scrubber, frame-step, mono timecode, and a coach sidebar with sync
  checkboxes + live joint-angle telemetry.
- Floating glass dock with mic/cam/layout/replay/leave; responsive; accessible; no invalid
  Tailwind classes.
