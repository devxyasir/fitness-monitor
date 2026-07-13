- **`app/(dashboard)/coach/sessions/page.tsx`**: Replace top nav (sessions/clips) with shell-provided nav; change inline `bg-live text-canvas` to `bg-live/90 text-canvas` for harmony; increase copy-invite feedback to **1.5s**; convert all `border-hairline` rows to hairline dividers; add a "+ Create room" form (card, bottom or right pane); wire filter tabs (All/Live/Scheduled/Ended).
- **`app/(dashboard)/coach/clips/page.tsx`**: Replace top header+nav with shell (remove redundant "ReplayCoach" wordmark + nav tabs since the Shell provides this); keep `MeetingGroups` as-is (it's a functional component, not broken); remove inline `bg-slate-*` gutters around the page → `bg-canvas` already inherited.
- **`app/(dashboard)/coach/students/page.tsx`**: Build — roster table (avatar + name, last active mono, sessions attended, trend sparkline, status pill); top-right "Invite student" action (email + generated link); row click → detail drawer w/ joint-angle history + clip list. Link to `/coach/students/[id]` (if route exists) or drawer.
- **`app/(dashboard)/student/sessions/page.tsx`**: Replace top header+nav with shell (remove duplicate wordmark/nav); fix minor color inconsistencies.
- **`app/(dashboard)/student/clips/page.tsx`**: Replace top header+nav: fix `bg-slate-950`→`bg-canvas` (inherited now). Keep empty-state copy matching spec.
- **`app/(dashboard)/coach/page.tsx`** (new Overview): Top: "Overview" title + range selector (7/30/90d). StatRow: 4 StatCards. Below: 2-col grid (left: Sessions-over-time Recharts area chart w/ neon gradient stroke + mono ticks + range selector; top-right: Student form trends multi-line Recharts line chart w/ legend = student names). Right column: Live/Upcoming rail (any live session pinned w/ emerald pill + "Join", then scheduled rows, then "Start instant room" button) + Recent clips grid (amber DVR ticks + mono timecodes). Show skeleton loader (shimmer on `panel-2`) while fetching; never display fake numbers.
- **`app/(dashboard)/student/page.tsx`** (new, per assumption): Simplified view — "Welcome back" header, maybe 3 stat cards (sessions attended, upcoming session, clips shared), recent sessions list. Keep calm.

### Session Room (visual-only, high care)
- **`app/session/[id]/page.tsx`**:
  - **Color replacements**: `bg-slate-950` → `bg-canvas`, `bg-slate-900` → `bg-panel`, `border-slate-900` / `border-slate-800` → `border-hairline`, `text-slate-300` / `text-slate-200` → `text-ink`, `text-slate-400` / `text-slate-500` → `text-ink-muted`, `text-white` → `text-ink` (or keep `text-ink` already).
  - **Header** (line 296–334): Wrap in `.glass`, hairline bottom. Status dot at left: `bg-live animate-pulse` (live) or `bg-replay animate-pulse` (replay). Replace inline `DVR REPLAY ACTIVE` badge w/ use of `<Pill variant="replay">Replay</Pill>` and `<Pill variant="live">● Live</Pill>`. Role badge: coach `border border-brand-indigo/30 text-brand-indigo` pill, student `text-ink-muted` pill. Leave button: `btn-danger` → `bg-danger/10 hover:bg-danger/20 text-danger border-danger/30`.
  - **Loading screen** (line 238–246): `bg-slate-950` → `bg-canvas`, `text-slate-200` → `text-ink`.
  - **Error/ended screens** (line 249–269, 272–289): `bg-slate-950` → `bg-canvas`, card → `.card`, `text-slate-400` → `text-ink-muted`, `text-white` → `text-ink`.
  - **Exit modal** (line 478–518): `bg-slate-950/80` → `bg-canvas/80`, card → `.glass`, `bg-red-700` → `btn-danger`, secondary button → `btn-ghost`.
  - **Lobby requests panel** (line 437–476): `bg-slate-900/95` → `.glass`, `border-slate-800` → `border-hairline`.
  - **Live/replay layout containers** (line 360–400): `bg-slate-950` → `bg-canvas`, `bg-slate-900` → `bg-panel`, `border-slate-900` → `border-hairline`.
  - **Replay controls sidebar** (line 373–390): `bg-slate-900/60` → `bg-panel/60`, `border-slate-900` → `border-hairline`.
  - **Control toolbar** (line 414–420): Remove the bare `border-t border-slate-900` bar and **replace with the floating glass ControlDock** (spec expects floating pill dock at center-bottom, not a full-width bottom bar). Important structural change.
  - **ControlsArea** (line 574–776): Move out of the bottom inline bar into a floating `<ControlDock>` absolute-center-bottom container. Update button styles: mic/cam use `w-11 h-11 rounded-full border border-hairline` default + muted state `bg-danger/10 border-danger/30 text-danger`. Screen share: `bg-brand-indigo hover:bg-brand-indigo/90` matches token. Remove the bottom toolbar `<div>` at line 414.
  - **Color grammar fixes**: The header uses `bg-red-600 animate-ping` as the "live" indicator — change to `bg-live animate-pulse` to match color grammar (emerald = live). The "insufficient footage" amber banner (line 290–293, in VideoGrid) → change amber to `danger` to keep amber reserved for replay. The "DVR REPLAY ACTIVE" text-amber-500 is correct (amber for replay) — keep it.
  - **Amber button in ControlsArea**: The "Replay 30s" button is described in DESIGN_04 §6 as the **one amber-tinted action** in the dock. The current ControlsArea (line 698–741) has upload/annotate buttons w/ `bg-indigo-600` — keep those, but add the "Replay 30s" action as amber: `bg-replay/20 border-replay/40 text-replay hover:bg-replay/30`. Note: spec says coach-only, currently appears for all — scope: visual only, keep existing visibility unless obvious bug.
  - **"Annotate Video" / "Full Body"** upload buttons (line 725–741): Visually these use `bg-indigo-600` (indigo, fine), but the progress bar at line 755 uses `bg-indigo-500` — matches brand, fine.
  - **`app/session/[id]/components/VideoGrid.tsx`**:
    - `bg-slate-950` → `bg-canvas`, `bg-slate-900` → `bg-panel` (in tile backgrounds, spots), `border-slate-800` → `border-hairline`.
    - Participant label (line 257): `bg-slate-950/80` → `.glass` (or `bg-canvas/70 backdrop-blur`), `border-slate-800` → `border-hairline`. Replace the `bg-green-500` dot with a `bg-live` dot (emerald, color grammar). Change label text from `text-white` → `text-ink`.
    - Coach pin/spotlight button (line 279): keep `bg-indigo-600` (brand-indigo) — fine.
    - "Analyze Last 10s" button (line 272): uses `bg-amber-600` — CHANGE to `bg-danger/10 text-danger` or `btn-danger` because this is a warning/action button not a replay indicator, and amber must be reserved for replay/DVR only. Actually since this initiates replay analysis, it IS a replay-related action — but the button label suggests it's the trigger, not the DVR state itself. The spec says amber is for the scrubber/playhead/timecode when "you're in the past." This button initiates analysis, which then plays a replay. → **I'd keep this button amber-tinted** since it triggers the replay (it's the gateway to amber territory), but change the success/insufficient banner to danger to avoid two amber spots for the same flow.
    - Insufficient footage banner (line 291): `text-amber-300 bg-slate-900/95 border-amber-800` → `text-danger glass border-danger/30`.
    - Active focus track spotlight (line 74): keeps `border-slate-800` → `border-hairline`, `shadow-2xl` → remove or use a softer `shadow-lg`.
    - Gallery grid (line 109): `border-slate-800` → `border-hairline`, `shadow-lg` → reduce.
  - **`app/session/[id]/components/SkeletonOverlay.tsx`**: This is the MAJOR visual change. The current implementation:
    - Uses `LIMB_COLORS` record w/ 7 distinct flat colors (violet/emerald/blue/amber/red/orange). → **Replace** with a single indigo→violet gradient stroke. On each limb draw, create a `CanvasGradient` between the two endpoints (`ctx.createLinearGradient(x1,y1,x2,y2)`) and add two color stops (`#6366F1` at 0, `#8B5CF6` at 1). Set `ctx.lineWidth = 1.5` (spec says 1.5–2px).
    - Currently uses hollow rings for joints (radius 6 + inner stroke). → **Replace** with small filled dots: `ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI*2); ctx.fillStyle='#8B5CF6'; ctx.fill();`
    - Add **glow** via `ctx.shadowColor = 'rgba(139,92,246,0.6)'` and `ctx.shadowBlur = 8` before drawing strokes (reset to 0 after).
    - Keep format detection (coco17/halpe26) and keypoint consumption — those are data logic, not visual.
    - The `globalAlpha = min(scoreA, scoreB)` trick should still work fine — preserve it.
  - **`app/session/[id]/components/ReplayPanel.tsx`**: Not read yet but flag — check for `slate-*` and replace with tokens; verify amber reserved for scrubber/transport only; tag-line markers should be amber.
  - **`app/session/[id]/components/AnnotationCanvas.tsx`**: Flag — verify tool dock uses `.glass` recipe; strokes can stay colorful (annotation color picker is user choice, not grammar).

### Polish Sweep
- **grep `bg-slate|text-slate|border-slate`** (excluding 50–900/950) across `app/` — should return nothing after.
- **grep `bg-zinc|text-zinc|border-zinc`** — should return nothing.
- **grep `bg-red-700|bg-emerald-950|bg-amber-950`** — replace w/ token-based recipes.
- **Color grammar**: Any remaining `amber-*` outside replay context → change. Any `emerald-*` outside live/active → change.
- **Page-by-page check**: Is every interactive element keyboard-reachable? Is every status color paired with text?
- **Remove one thing not earning its place** per spec quality floor: e.g., glow halos on auth, inline nav headers inside dashboard pages (now redundant), the `animate-pulse` on "Loading..." inline text.

---

This covers every brief, surfaces one major conceptual conflict (the skeleton rendering), one structural surprise (the ControlDock isn't yet a floating glass pill), and a handful of minor but real reconciliations. The plan front-loads the shared building blocks so every page composes rather than invents, and orders changes from lowest-risk (tokens → components → shell → pages → session room) so regressions are caught early.