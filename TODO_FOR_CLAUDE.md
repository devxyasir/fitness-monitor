# ReplayCoach — Remaining Work for Claude

> **Date:** July 13 2026  
> **Completed by previous agent:** Design tokens, component library, landing, auth, dashboard shell, coach/student pages, error/not-found, backend hardening (transactions, throttling, secrets).  
> **This document:** Everything still to fix/implement. Refer to `design_html/*.dc.html` for visual reference.

---

## DESIGN REFERENCE

All visual designs are in `design_html/`. **Read these files before implementing:**

| File | What it describes |
|---|---|
| `design_html/00-Foundation.dc.html` | Tokens, type, buttons, pills, glass, cards, skeleton signature |
| `design_html/Landing.dc.html` | Marketing landing page (logged-out) |
| `design_html/Auth.dc.html` | Login/register: split shell, gradient card, inputs, errors |
| `design_html/Coach-Overview.dc.html` | Analytics: stat cards, charts, live rail, recent clips |
| `design_html/Coach-Sessions.dc.html` | Session list: two-pane, create form, status pills, copy-invite |
| `design_html/Coach-Clips.dc.html` | Clip gallery: scrubber thumbnails, hover-play, empty state |
| `design_html/Coach-Students.dc.html` | Roster table, detail drawer, invite flow |
| `design_html/Student-Overview.dc.html` | Welcome, stat cards, recent sessions |
| `design_html/Student-Sessions.dc.html` | Session history with join/download actions |
| `design_html/Student-Clips.dc.html` | Clips shared by coach |
| `design_html/Session-Room.dc.html` | Live/replay room: floating dock, amber scrubber, neon skeleton, header, sidebar |

---

## 1. SESSION ROOM — VISUAL REDESKIGN (CRITICAL)

**File:** `apps/web/app/session/[id]/page.tsx` (872 lines)

### What to do
Read `design_html/Session-Room.dc.html` and restyle **markup only**. All behavioral hooks (`useLiveKitRoom`, `useReplaySocket`, `usePoseOverlay`, etc.) stay intact.

### Specific changes
1. **Header** (currently raw `bg-slate-900` with inline styles):
   - `.glass` surface, hairline bottom border
   - Status chip: `<Pill variant="live" pulse>● Live</Pill>` or `<Pill variant="replay">◍ Replay</Pill>`
   - Session ID in `font-mono` + copy-invite button
   - Role badge: `COACH` (brand-indigo) / `STudent` (muted)
   - Leave button: `btn-danger` (red)
   - Replace `bg-red-600 animate-ping` live dot → `bg-live animate-pulse`

2. **Control dock** (currently full-width bottom bar):
   - Convert to **floating center-bottom glass pill dock** (radius `pill`, `.glass`)
   - Mic/cam/layout buttons: `w-11 h-11` circles, hairline border
   - "Replay 30s": amber-tinted button (`border-replay/40 text-replay bg-replay/10`)
   - "End for everyone" (coach): danger button
   - Tooltip titles on hover

3. **Replay scrubber** (in `ReplayPanel.tsx`):
   - Amber track (`bg-replay/15`), rounded handle, tick marks per second
   - Mono timecode `00:12.4 / 00:30.0`
   - Frame-step transport (◄◄/►►), play/pause, speed selector (0.5x/1x/2x)

4. **Live** grid tiles:
   - Hairline border, `rounded-md`, active speaker = emerald ring (`ring-2 ring-live/40`)
   - Participant label: `.glass` chip bottom-left
   - Hover actions (pin, "Replay 30s", overlay toggle): glass icon buttons top-right

5. **Coach sidebar** (during replay):
   - Sync checkboxes per student
   - Live joint-angle telemetry block (`font-mono` rows)
   - "Return to live" emerald button

6. **Modals** (exit, upload, analyzing, annotate):
   - `.glass` surface, gradient border
   - Accessible focus trap

---

## 2. SKELETON OVERLAY — NEON STYLE

**File:** `apps/web/app/session/[id]/components/SkeletonOverlay.tsx`

### Current
Flat multi-colored limbs (violet/emerald/blue/amber/red/orange), hollow joint rings.

### Required (from `design_html/00-Foundation.dc.html` and `Session-Room.dc.html`)
- Thin strokes: `lineWidth = 1.5`
- Indigo→violet gradient per bone: `ctx.createLinearGradient(x1,y1,x2,y2)` with stops `#6366F1` → `#8B5CF6`
- Soft glow: `ctx.shadowColor = 'rgba(139,92,246,0.6)'`, `ctx.shadowBlur = 8`
- Joints: small filled dots (`r=2.5`) with matching glow
- Keep COCO-17/Halpe-26 format detection and keypoint consumption — only drawing style changes

---

## 3. ANNOTATION EXPORT — TWO OPTIONS

**File:** `apps/web/app/session/[id]/components/AnnotationTrackingModal.tsx`

### Required behavior
Coach can choose between:
1. **Download full skeleton video** — raw video + all pose keypoints (current behavior)
2. **Download annotations only** — raw video + ONLY coach-drawn annotations (no skeleton bones)

### Implementation
- Add a toggle/radio in the modal: `DownloadMode = 'skeleton' | 'annotations_only'`
- Pass `draw_skeleton_layer: boolean` to the export API
- The pose-service `export_renderer.py` already supports `draw_skeleton_layer=False` (just pass `False` when annotations-only selected)
- UI: two radio buttons next to the export button:
  ```
  ○ Full skeleton + annotations
  ○ Annotations only (no skeleton)
  ```

---

## 4. VIDEO POPUP RENDERING & PLAYBACK

**Files:** `apps/web/app/session/[id]/components/ReferenceAnalysisModal.tsx`, `ReferenceVideoQueue.tsx`, `apps/web/app/(dashboard)/components/ClipPlaybackModal.tsx`

### Issues to fix
1. **Video plays but annotation overlay is invisible** — ensure canvas layers composite correctly over `<video>` element. The annotation canvas must be `position: absolute` on top of the video, and the composite must render in export.
2. **Playback controls** — play/pause/seek/frame-step/loop in the ReferenceAnalysisModal
3. **HLS.js** for long recordings — ensure `ClipPlaybackModal.tsx` initializes HLS correctly for `.m3u8` manifests
4. **Video download** — the download button should trigger the export API and provide the correct mode (skeleton vs annotations-only)

### Reference
All canvas compositing should use the `drawCompositeFrame()` pattern from `AnnotationTrackingModal.tsx` (already implemented during the audit fix).

---

## 5. DASHBOARD — WIRE REAL DATA

### Coach Overview (`apps/web/app/(dashboard)/coach/page.tsx`)
Currently shows placeholder zeros. Wire to real endpoints:
- **Stats cards**: `GET /sessions` (count), `GET /coach/students` (active count), pose accuracy from session recordings
- **Sessions-over-time chart**: aggregate `GET /sessions` by week → Recharts AreaChart with neon gradient stroke
- **Student form trends**: multi-line Recharts LineChart per student
- **Live rail**: filter sessions where `status === 'live'`
- **Recent clips**: `GET /clips` sorted by `createdAt DESC` LIMIT 5

### Required Recharts wrapper
```tsx
// app/components/ui/Chart.tsx
// Override Recharts defaults: stroke vars, grid hairline, mono ticks, glass tooltip
```

---

## 6. THEME SYSTEM — LIGHT & DARK

### Files to modify
- `apps/web/tailwind.config.ts` — add `dark:` variant classes
- `apps/web/app/layout.tsx` — add `ThemeProvider` or `data-theme` attribute
- `apps/web/app/globals.css` — add light theme CSS variables

### Design
- **Dark** (current): canvas `#070B14`, panel `#0F1522`, ink `#E7ECF5`, violet accent
- **Light** (new): canvas `#F8F9FC`, panel `#FFFFFF`, ink `#1A1F2E`, same violet accent
- **Toggle**: add to topbar user menu (sun/moon icon)
- Store preference in `localStorage` or cookie

### Implementation approach
Use Tailwind's `dark:` variant with a `class` strategy:
- Add `class="dark"` to `<html>` for dark mode
- Add a toggle that switches between `dark` and no class
- All components use `dark:bg-canvas bg-white` pattern

---

## 7. ANIMATIONS & MICRO-INTERACTIONS

### Keyframes to add (in `globals.css` or `tailwind.config.ts`)
- `rise` — fade + translateY(6px→0) for list items entering
- `settle` — scale(0.94→1) for hero mock
- `shimmer` — gradient slide for skeleton loaders
- `pulse` — opacity breathing for live indicators
- `slide-up` — for modals/drawers

### Where to apply
- Stat cards: `animate-rise` on load
- Session rows: stagger `animate-rise`
- Modal open: `animate-settle`
- Skeleton states: `animate-shimmer`
- Live dot: `animate-pulse`

---

## 8. SVGs & DECORATIVE ELEMENTS

### Required SVGs
1. **Logo/wordmark**: `◇` diamond (gradient indigo→violet) + "ReplayCoach" in `font-display`
2. **Hero skeleton**: canvas-drawn neon stick figure (already implemented in landing page)
3. **Icons**: use `lucide-react` throughout (already installed)
4. **Empty states**: custom SVG illustrations for each empty page
5. **Feature icons**: instant replay, pose overlays, coaching rooms (simple line icons)

### Empty state components
```tsx
// app/components/ui/EmptyState.tsx
// Props: icon, title, body, action (optional button/link)
// Background: panel, dashed border, centered content
```

---

## 9. AUTH FLOW POLISH

**Files:** `apps/web/app/(auth)/login/page.tsx`, `register/page.tsx`

### Issues to fix
1. **Password validation feedback** — inline strength indicator (min 8 chars, upper + lower + digit)
2. **OAuth buttons** — remove or implement Google OAuth (currently disabled with "coming soon")
3. **Redirect after login** — currently goes to `/coach/clips` or `/student/sessions` → should go to `/coach` (overview) or `/student` (overview)
4. **Email verification** — add UI flow (currently stub)
5. **Password reset** — forgot password flow (currently stub)
6. **Error animations** — form-level errors should `animate-rise` in

---

## 10. WEBSOCKET RELIABILITY

**File:** `apps/web/lib/socket-client.ts`

### Issues to fix
1. **Reconnect doesn't re-join rooms** — after reconnect, client must re-emit `session:join` for the current session
2. **Token refresh** — if WS auth fails, refresh token and reconnect automatically
3. **Connection quality indicator** — show reconnecting/latency state
4. **Graceful degradation** — if WS fails, poll API periodically for session state

---

## 11. API ERROR HANDLING & LOADING STATES

**File:** `apps/web/lib/api-client.ts`

### Issues to fix
1. **Toast notifications** — use a toast library (e.g., `sonner` or `react-hot-toast`) for API errors instead of `alert()` and `console.error`
2. **Loading states** — every data-fetching component must show skeleton loader (not spinner)
3. **Error boundaries** — wrap each dashboard page section in error boundaries so one failure doesn't crash the whole page
4. **Empty states** — every list must have an empty state with action link
4. **Retry logic** — failed API calls should offer retry

---

## 12. SERVICES & INFRASTRUCTURE ISSUES

### Pose Service (`apps/pose-service/`)
1. **Model loading timeout** — if models don't load, service should return 503 with clear error
2. **Worker pool scaling** — auto-scale based on queue depth
3. **Redis stream consumer lag** — monitor and alert if lag > 1000 messages
4. **Export timeout** — long exports should return a job ID, poll for completion

### API (`apps/api/`)
1. **Migration runner** in production — ensure migrations run on deploy
2. **Health check deep probe** — `/health` should check DB + Redis + pose-service reachability
3. **CORS** — restrict to actual domains in production
4. **Request validation** — all endpoints should return 400 with field-level errors

---

## 13. DOWNLOAD SYSTEM

**File:** `apps/web/app/(dashboard)/components/downloadClip.ts`

### Issues to fix
1. **Download filename** — use clip title + date, not UUID
2. **Progress indicator** — show download progress for large files
3. **Format selection** — offer MP4 (burned-in) or JSON (annotations only for re-render)
4. **Permission check** — students can only download clips shared to them (IDOR check on backend)

---

## 14. STUDENT PAGES — DATA WIRING

### Student Sessions (`apps/web/app/(dashboard)/student/sessions/page.tsx`)
- Currently wired to `GET /sessions` — filter to only sessions the student participates in
- Show coach name alongside session date

### Student Clips (`apps/web/app/(dashboard)/student/clips/page.tsx`)
- Already wired to `GET /clips` — ensure it only shows clips shared to this student
- Add filter by session/coach

### Student Overview (`apps/web/app/(dashboard)/student/page.tsx`)
- Wire to real data: sessions attended count, next upcoming session, clips shared count

---

## 15. COACH STUDENTS PAGE — LIVE KEYPOINT RELAY

**File:** `apps/web/app/(dashboard)/coach/students/page.tsx`

### Current state
Static table with dummy data.

### Required
1. `GET /coach/students` endpoint — list students invited by/in this coach's org
2. **Student detail drawer** — click row → show joint-angle history sparkline + clips list
3. **Invite flow** — email invite or generate shareable link
4. **Status pills** — active/invited/inactive

---

## 16. 404 & ERROR PAGES — POLISH

**Files:** `app/not-found.tsx`, `app/error.tsx` (already created)

### Remaining
- Add "Back to dashboard" button (not just home)
- Add illustration/SVG
- Log errors to monitoring service (Sentry integration)

---

## 17. ACCESSIBILITY AUDIT

### WCAG AA requirements
- Every `<img>` has `alt` — skeleton overlays and SVGs must have `aria-hidden` or descriptive `alt`
- Every `<button>` has accessible name (use `aria-label` for icon-only buttons)
- Form inputs have `<label htmlFor>` (partially done in Input.tsx)
- Error messages linked via `aria-describedby` (done in Input.tsx)
- Color contrast: ink on canvas ≥ 4.5:1 (verify with tool)
- Touch targets ≥ 44×44px (verify all buttons)
- `prefers-reduced-motion` respected (already in globals.css)

---

## 18. RESPONSIVE DESIGN — MOBILE

### Pages verified (during this session)
- Landing: stacks at `lg`
- Auth: card-only below `lg`
- Dashboard sidebar: collapses to icon-rail at `md`, hidden below
- Tables: become stacked cards on mobile

### Still needs work
- Session room: floating dock must shrink/rearrange on small screens
- Video grid: responsive columns (1→2→3+)
- Sidebar: drawer overlay on mobile

---

## 19. BUILD & DEPLOY ISSUES

### Current issues
1. **Font download fails in build** — `next/font/google` tries to download fonts at build time, server has no internet → use `next/font/local` or CDN `<link>` instead
2. **PM2 web service crashes** — font build failure causes `.next/BUILD_ID` to be missing → fix #1 resolves this
3. **CALLBACK_TOKEN_SECRET** — already added to `.env` on server but needs rotation strategy

---

## PRIORITY ORDER

1. Fix build/deploy (font issue) — site is currently down
2. Session room visual redesign — core product feature
3. Skeleton neon style — signature visual
4. Dashboard data wire — make it functional
5. Auth flow polish — login/signup edge cases
6. Download system (annotation-only option) — user request
7. Theme system (light/dark) — UX improvement
8. Animations & SVGs — polish
9. WS reliability — infrastructure
10. Accessibility audit — compliance

---

## FILES/MODULES LEFT TODO

| Module | File(s) | Type |
|---|---|---|
| Session room visual | `session/[id]/page.tsx` | Frontend restyle |
| Skeleton neon style | `session/[id]/components/SkeletonOverlay.tsx` | Visual only |
| Annotation export modes | `session/[id]/components/AnnotationTrackingModal.tsx` | Feature |
| Video popup rendering | `ReferenceAnalysisModal.tsx`, `ClipPlaybackModal.tsx` | Bug fix |
| Dashboard data wiring | `(dashboard)/coach/page.tsx`, `student/page.tsx` | Integration |
| Theme system (light/dark) | `tailwind.config.ts`, `layout.tsx`, `globals.css` | Feature |
| Animations | `globals.css`, `tailwind.config.ts` | Polish |
| Empty states | `components/ui/EmptyState.tsx` | Component |
| Auth polish | `(auth)/login/page.tsx`, `register/page.tsx` | UX fix |
| WS reliability | `lib/socket-client.ts` | Infrastructure |
| API error handling | `lib/api-client.ts` | Infrastructure |
| Mobile responsive | `session/[id]/page.tsx`, sidebar | UX fix |
| Living students page | `(dashboard)/coach/students/page.tsx` (done, needs data) | Integration |
| 404/Error polish | `error.tsx`, `not-found.tsx` | Polish |
| Build/deploy fix | `next.config.max` (font loading) | Critical |
| Services health | `apps/api/src/health/health.controller.ts` | Infrastructure |
| Chart wrapper | `components/ui/Chart.tsx` | Component |
| Clip download logic | `(dashboard)/components/downloadClip.ts` | Feature |

---

*End of TODO*
