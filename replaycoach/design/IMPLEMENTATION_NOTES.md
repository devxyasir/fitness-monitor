# Implementation Notes

Read this first. Then `DESIGN_SYSTEM.md` for tokens/components. Then
implement pages one at a time from `design/pages/`, in the build order
below.

## What this supersedes

`design_html/*.dc.html` (11 static HTML mockups) and the indigo/violet
dark-only token system in `apps/web/tailwind.config.ts` /
`apps/web/app/globals.css` — both were built earlier in the same day this
spec was written, before the direction changed. Do not reference
`design_html/` for anything going forward; if you find yourself about to
match its indigo/violet gradients or dark-canvas-only styling, that's the
old direction, not this one.

## This project's real conventions (from Phase 1 audit)

- **Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Zustand for
  client state (`stores/*.ts`, plain `create()`, no persist middleware
  except `theme-store.ts` which hand-rolls localStorage). No CSS-in-JS.
- **Styling:** Tailwind utility classes directly in JSX, no separate
  stylesheet per component. Shared design-token classes come from
  `tailwind.config.ts`'s `theme.extend.colors` (CSS-variable-backed, see
  `DESIGN_SYSTEM.md` §6) plus a small `@layer components` block in
  `globals.css` for a few named classes (`.card`, `.btn-primary`, etc.) —
  keep using both mechanisms, don't invent a third.
- **Icons:** `lucide-react`, already a dependency. Don't add another icon
  library.
- **File/folder conventions:** route groups `(auth)`/`(dashboard)` for
  shared layouts; page-local components live in a `components/` folder
  next to the page that uses them (e.g. `app/session/[id]/components/`,
  `app/(dashboard)/components/`); shared cross-page UI primitives live in
  `app/components/ui/` (`Button.tsx`, `Card.tsx`, `Input.tsx`, `Pill.tsx`,
  `Sparkline.tsx`) — the components in `DESIGN_SYSTEM.md` §8 belong there.
- **Data fetching:** plain `apiClient.get/post/patch` (`lib/api-client.ts`)
  inside `useEffect`, component-local `useState` for loading/error/data —
  no React Query/SWR in this codebase. Don't introduce one; match the
  existing pattern.
- **Fonts:** self-hosted via `next/font/local` (`apps/web/public/fonts/`,
  wired in `apps/web/app/layout.tsx`) — **not** `next/font/google`. This is
  load-bearing: the production host has no outbound internet access, and
  `next/font/google` fetches at build time, which breaks the production
  build entirely. When adding Fraunces, follow the exact existing pattern:
  fetch the woff2 from Google Fonts' CSS2 API once, vendor the file under
  `public/fonts/`, wire a `localFont()` call. Do not switch any font to
  `next/font/google`.

## Locked dependency list

Only these libraries may be used for anything design/UI-related. If a spec
in `design/pages/` seems to need something not on this list, implement it
with what's here instead of adding a package — flag it in a code comment if
you genuinely can't.

- `lucide-react` (icons — already present)
- `tailwindcss` (already present)
- `zustand` (already present, for any new client state)
- `hls.js` (already present, video playback — clip library only)
- `livekit-client` / `@livekit/components-react` (already present, session room only)
- Plain `<svg>` for all custom illustration/chart work — no charting
  library, no animation library (no Framer Motion, no GSAP). Every
  animation in `DESIGN_SYSTEM.md` §5 is a CSS `@keyframes` + Tailwind
  `animate-*` class, deliberately, so no new runtime dependency is needed
  for motion.

No new npm dependency should be added for this redesign, full stop — the
above already covers every requirement in `design/pages/`.

## Build order

1. **Tokens first.** Replace `tailwind.config.ts`'s color block and
   `globals.css`'s `:root` / `:root[data-theme='light']` blocks per
   `DESIGN_SYSTEM.md` §6. Add the `fontSize` scale (§2.2), the retimed
   `keyframes`/`animation` blocks (§5), and `darkMode: ['selector',
   '[data-theme="dark"]']` (§8.1 note). Vendor the Fraunces font file and
   wire it into `layout.tsx` alongside the existing three.
2. **Shared components.** Update `app/components/ui/{Button,Card,Input,Pill}.tsx`
   in place per `DESIGN_SYSTEM.md` §8.1–8.4. Add new shared files for
   Modal (§8.5), the generalized Tabs (§8.9), and the `StateBlock` /
   `SkeletonRows` / `ErrorBlock` trio (§9) — put these in
   `app/components/ui/` alongside the existing four.
3. **Pages, in this order** (earlier pages establish patterns later pages
   reuse — do them in sequence, not in parallel, so e.g. the dashboard
   stat-card pattern exists before you need it three more times):
   1. `landing.md` — establishes the brand accent + Fraunces display type at
      the largest scale.
   2. `auth.md` — smallest surface area, good second page to prove the
      token swap works end to end.
   3. `session-join.md` — **currently 100% unmigrated** (still raw Tailwind
      `slate-950`/`indigo-600`/`red-950` from before any design-token work
      existed at all) — do this early since it's a from-scratch page, not
      a re-skin.
   4. `coach-overview.md` then `student-overview.md` — establishes the
      analytics-domain stat-card + chart pattern (§8.2's `accent` prop,
      §1.4's chart palette) reused by every later dashboard page.
   5. `coach-sessions.md` / `student-sessions.md` — table pattern (§8.7).
   6. `coach-clips.md` / `student-clips.md` — also update
      `app/(dashboard)/components/MeetingGroups.tsx`'s header, which is
      **currently unmigrated** (raw `slate-900`/`indigo-950` — a gap the
      earlier token migration missed even though the `ClipCard` it wraps
      was migrated).
   7. `coach-students.md`.
   8. `session-room.md` — the largest, most complex page (main page +
      ~10 subcomponents under `app/session/[id]/components/`). Do this
      after the dashboard pages so the session-domain accent (`color-session`)
      has already been proven out in simpler contexts first.
   9. `admin.md` — lowest priority (internal/platform-admin only, low
      traffic), also flags a real data gap (see that page's doc).
   10. `error-pages.md` (`not-found.tsx`, `error.tsx`, `app/dashboard/page.tsx`
       redirect) — quick, do last.

## Scope guardrails

- **This is a presentation-layer redesign.** Do not change business logic,
  data-fetching behavior, API contracts, WebSocket/LiveKit event handling,
  or existing tests. The sole exception is the specific, narrow backend/data
  additions called out in individual page docs (e.g. `admin.md` flags that
  platform stats are hardcoded to zero) — those are pre-approved and scoped
  exactly to what's stated, nothing broader.
- **Preserve every existing route, prop, and behavioral hook.** Session
  room components in particular (`useLiveKitRoom`, `useReplaySocket`,
  `usePoseOverlay`, `useSessionRoom`, `useAnnotationTrackingSocket`, the
  Socket.IO reconnect/rejoin logic, the LiveKit connection-quality
  indicators) are all correct and were verified working earlier today —
  touch only JSX markup/className, never the surrounding hooks/state/effects
  in those files.
- **If a page doc conflicts with the real current code** (props renamed,
  a component restructured since this was written, etc.), follow this
  doc's design *intent*, adapt the code to fit what's actually there, and
  leave a `// DEVIATION: <what and why>` comment at the point of change —
  do not silently reinterpret the design or skip the page.
- **Verify contrast and both themes before marking a page done.** Every
  color pairing used should trace back to a token in `DESIGN_SYSTEM.md` §1
  (already contrast-verified) — if a page doc's code sample uses a token
  correctly, you don't need to re-verify contrast; if you deviate from the
  sample, do the same relative-luminance check §1 demonstrates before
  shipping the deviation.
