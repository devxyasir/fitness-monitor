# DESIGN 03 — Dashboard + app shell + analytics (coach & student)

**Surfaces:** a shared dashboard shell + a new **coach overview** page + reshaped sub-pages
(`app/(dashboard)/coach/{sessions,clips,students}`, `student/{sessions,clips}`).
`app/dashboard/page.tsx` stays a role redirect (send coach → `/coach` overview, student →
`/student/sessions`).
**Depends on:** `DESIGN_00`.

This is the heart of the "proper mini-SaaS, not simple pages" ask. Build a real app shell
and a genuine analytics overview — not a bare list.

---

## 1. App shell (build first, wrap all dashboard routes)

Create `app/(dashboard)/layout.tsx` with a persistent shell:

```
┌───────────┬───────────────────────────────────────────────────────┐
│  SIDEBAR  │  TOPBAR: page title      [⌘K search]  [+ New session] 🔔 avatar│
│           ├───────────────────────────────────────────────────────┤
│ ◇ Replay  │                                                        │
│  Coach    │   ROUTE CONTENT                                         │
│           │                                                        │
│ Overview  │                                                        │
│ Sessions  │                                                        │
│ Clips     │                                                        │
│ Students  │                                                        │
│ ───────   │                                                        │
│ Settings  │                                                        │
│           │                                                        │
│ [avatar]  │                                                        │
│  name     │                                                        │
│  Coach ▾  │                                                        │
└───────────┴───────────────────────────────────────────────────────┘
```

- **Sidebar:** fixed, ~240px, `panel` with hairline right border. Gradient ◇ wordmark up
  top; a small role label. Nav links use `.sidebar-link` (icon + label; active state = subtle
  `panel-2` fill + a 2px indigo left marker + brighter text). **Role-aware links:** coach
  sees Overview / Sessions / Clips / Students; student sees Overview / Sessions / Clips.
  Collapses to icon-rail on `md`, drawer on mobile.
- **Topbar:** slim, `.glass`, sticky. Left: current page title in `font-display`. Center/
  right: a command-style search (`⌘K` affordance — wire later, style now), the primary
  **"New session"** action (gradient), a notifications bell, and the user avatar → menu
  (profile, settings, log out). Bottom sidebar has the user chip too.

Keep everything calm: one primary action (New session) is the only saturated element in the
chrome.

## 2. Coach Overview (`app/(dashboard)/coach/page.tsx` — new)

The analytics home. Structure, top to bottom:

```
Overview                                            Last 30 days ▾
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ Sessions     │ Active       │ Avg telemetry│ Replay clips │   ← STAT ROW
│ hosted   28  │ students  14 │ accuracy 91% │ saved    63  │
│ ▁▂▃▅▆▇ +12%  │ ▂▂▃▃▄▅ +3   │ ▅▅▆▆▇▇ +2pts │ ▁▃▂▅▆▇ +18% │   ← sparkline + delta
└──────────────┴──────────────┴──────────────┴──────────────┘
┌────────────────────────────────────┬───────────────────────┐
│ Sessions over time (area/line)     │ Upcoming / Live now    │
│  ── neon indigo→violet line        │  • Live pill session   │
│  mono axis labels                  │  • Scheduled rows      │
│                                    │  [ Start instant room ]│
├────────────────────────────────────┤                       │
│ Student form trends (multi-line)   │ Recent clips (thumbs)  │
│  joint-angle accuracy per student  │  amber DVR ticks       │
└────────────────────────────────────┴───────────────────────┘
```

- **Stat row:** four `StatCard`s. Each: mono figure (big, `font-mono`), plain label, an
  inline **sparkline** (hand-rolled SVG, neon indigo stroke), and a delta chip
  (emerald ▲ / danger ▼). Metrics: *Sessions hosted, Active students, Avg telemetry accuracy,
  Replay clips saved.* These map to data you likely already have (sessions, participants,
  recordings, clips); where a metric isn't computable yet, wire the card to a real endpoint
  or clearly mark it — **do not hardcode fake numbers in production code**; use a loading
  skeleton and a real query, or a labeled placeholder in dev.
- **Sessions-over-time chart:** Recharts area/line, neon gradient stroke, faint grid,
  mono tick labels, tooltip on `.glass`. Range selector (7/30/90d) top-right.
- **Student form trends:** the coaching payoff — a multi-line chart of a form metric (e.g.
  shoulder/hip angle accuracy) per student over recent sessions, so a coach sees who's
  improving. Legend = student names; lines share the neon family with distinct hues. If
  per-joint history isn't persisted yet, scope this to what the pose data provides and note
  the dependency (ties to `fix-briefs/FIX_06` persistence).
- **Live/Upcoming rail:** a compact list — any `Live now` session pinned at top with an
  emerald pulse pill and a "Join" button; scheduled sessions below; a "Start instant room"
  primary button.
- **Recent clips:** small thumbnail grid with amber DVR tick marks and mono timecodes,
  linking into the clip player.

## 3. Sessions page (`coach/sessions`, `student/sessions`) — reshape

Two-pane as the original brief described:

- **Left — session list:** rows on `panel`, hairline dividers. Each row: title, date/time
  (mono), a **status Pill** (`Live now` emerald-pulse / `Scheduled` indigo / `Ended` faint),
  participant count, and a **copy-invite** icon button (copies link, shows a "Copied" tick
  for 1.5s). Filter tabs (All / Live / Scheduled / Ended) and search up top.
- **Right — Create session room:** a clean `.card` with an elegant form → title, mode
  (instant / scheduled), cohort/approval toggle, and an **invite generator** (readonly mono
  link + copy). Primary "Create room" opens the room. Keep it a panel on `lg+`, a modal
  dialog on smaller screens.

## 4. Students page (`coach/students`) — reshape

A roster table: avatar + name, last active (mono), sessions attended, a small **form-trend
sparkline** per student, and a status pill (active/invited/inactive). Row → student detail
drawer with their joint-angle history and clip list. Invite-student action (email + generated
link) top-right. This is where "student data insights" lives at the individual level.

## 5. Clips page (`coach/clips`, `student/clips`) — reshape

A gallery of saved replays: thumbnail cards with an **amber scrubber tick strip**, title,
duration (mono timecode), session + date, and hover-play. Filter by session/date. Clicking
opens the existing clip player modal. Empty state: "No clips yet — save a replay from a live
room to see it here," with a link to start a session (empty screens invite action).

## 6. Charts & data

- Add **Recharts** (`pnpm add recharts`) for the two big charts; sparklines are inline SVG
  (no dep). Theme every chart to the tokens: `panel` tooltips, hairline grid, mono ticks,
  neon strokes, no default chartjs-blue.
- Fetch through the existing API client so loading/error/empty states are real. Show shaped
  **skeleton loaders** (shimmer on `panel-2`) while loading — not spinners on blank pages.
- **Never ship fabricated metrics.** Wire to real endpoints; if an endpoint doesn't exist,
  flag it as a backend follow-up rather than hardcoding numbers.

## 7. Files to touch

- [ ] `app/(dashboard)/layout.tsx` — shell (sidebar + topbar) **(new, required)**
- [ ] `app/(dashboard)/coach/page.tsx` — overview analytics **(new)**
- [ ] `app/dashboard/page.tsx` — redirect coach→`/coach`, student→`/student/sessions`
- [ ] `app/(dashboard)/coach/{sessions,clips,students}/page.tsx` — reshape onto shell/components
- [ ] `app/(dashboard)/student/{sessions,clips}/page.tsx` — reshape
- [ ] `app/components/ui/{Sidebar,Topbar,StatCard,Sparkline,Pill,Chart,SkeletonLoader}.tsx`

## 8. Accessibility & responsive

Sidebar collapses (icon-rail → drawer) with a keyboard-toggle and focus trap in the drawer;
tables scroll gracefully on mobile / become stacked cards; charts have text summaries or
accessible labels; every interactive control has a visible focus ring; status color is never
the *only* signal (pills have text too).

## 9. Acceptance criteria

- A shared shell wraps all dashboard routes; nav is role-aware with a clear active state.
- Coach overview shows real stat cards (mono figures + sparklines + deltas), two themed
  charts, a live/upcoming rail, and recent clips — not a bare list.
- Sessions/Students/Clips pages are reshaped with pills, copy-invite, and proper empty/
  loading states.
- No fabricated production numbers; amber=replay / emerald=live grammar holds; responsive;
  no invalid Tailwind classes.
