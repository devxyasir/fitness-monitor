# DESIGN 01 — Marketing landing page (`/`)

**Surface:** `app/page.tsx` (currently a redirect stub — replace with a real landing).
**Depends on:** `DESIGN_00` (tokens, fonts, components).

---

## 1. Goal

A premium, minimal marketing page that makes a coach immediately understand: *this is a film
room for movement — live video, a skeleton overlay, and instant replay.* Linear/Vercel
restraint, one memorable signature (the neon skeleton hero), a clear path to sign up.

**Routing:** `app/page.tsx` currently `router.push('/login')` unconditionally. Change it to
render the landing for logged-out visitors and redirect authenticated users to
`/dashboard`. Keep it a client component only if needed for the auth check; prefer a server
component with the redirect handled by reading the session, falling back to client if that's
simpler in this codebase.

## 2. Layout

```
┌──────────────────────────────────────────────────────────────┐
│  ◇ ReplayCoach            Product   Pricing   Docs   [Log in] [Start free] │  ← slim glass nav, sticky
├──────────────────────────────────────────────────────────────┤
│                                                              ░ │  ← ambient indigo/violet
│   HERO (split)                                                 │     radial glow behind
│   ┌───────────────────────────┐  ┌──────────────────────────┐ │
│   │ eyebrow: LIVE FILM ROOM   │  │  [ interactive mock grid ]│ │
│   │                           │  │  coach tile │ student tile│ │
│   │ Real-time video feedback  │  │  ── neon skeleton overlay │ │  ← SIGNATURE
│   │ for elite training.       │  │     on the student feed   │ │
│   │                           │  │  ▸ amber DVR scrubber under│ │
│   │ subcopy (2 lines)         │  │    the player, mono timecode│ │
│   │ [Start free] [Watch demo] │  │  telemetry chip: SHLDR_L 142°│
│   └───────────────────────────┘  └──────────────────────────┘ │
│   trust strip: "used by …" small mono logos / stat            │
├──────────────────────────────────────────────────────────────┤
│  FEATURES — three columns                                      │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐                 │
│  │ Instant    │ │ Pose       │ │ Multi-user │                 │
│  │ replay     │ │ overlays   │ │ rooms      │                 │
│  └────────────┘ └────────────┘ └────────────┘                 │
├──────────────────────────────────────────────────────────────┤
│  HOW IT WORKS — 3 steps (numbered — a real sequence)          │
├──────────────────────────────────────────────────────────────┤
│  CLOSING CTA band  +  minimal footer                          │
└──────────────────────────────────────────────────────────────┘
```

## 3. Sections in detail

**Nav.** Slim, sticky, `.glass`, hairline bottom border. Wordmark left (◇ mark in the
indigo→violet gradient + "ReplayCoach" in `font-display`). Right: quiet text links + a ghost
"Log in" and a solid gradient "Start free". Collapses to a menu on mobile.

**Hero (the thesis).** Split. Left: a small mono eyebrow (`LIVE FILM ROOM`), an H1 in
`font-display` at ~3.5rem tight leading, two lines of `muted` subcopy, two CTAs (primary
gradient + ghost "Watch demo"). Right: **the signature** — a mocked 2-tile call grid
(coach + student) where the student tile has the **animated neon skeleton overlay** and a
small **amber DVR scrubber** with a mono timecode below it, plus a floating glass telemetry
chip (`SHOULDER_L 142°`). This one visual states the entire product. Animate the skeleton
subtly on load (joints settle in); pause under reduced-motion. Behind the hero: soft radial
glow, no hard shapes.

**Features (three columns).** Cards on `panel`, hairline border, generous padding, subtle
hover lift + border brighten. Each: a thin line-icon (not a filled blob), a short
`font-display` title, one sentence of plain copy. The three:
- **Instant replay** — "Rewind the last 30 seconds without dropping the call."
- **Pose overlays** — "See joint angles and form on a live skeleton, frame by frame."
- **Coaching rooms** — "Bring a cohort into one room and cue replays for everyone at once."

**How it works (numbered — order is real here).** Three steps: *Go live → Catch the moment
→ Show the fix.* Numbering is justified because it's a genuine sequence. Keep each step to a
title + one line.

**Closing CTA + footer.** A calm full-width band: headline + single primary CTA, over a
faint gradient. Footer: wordmark, a few link columns (Product / Company / Legal), copyright
in mono. No newsletter bloat unless it's real.

## 4. Copy rules

Write like a coaching tool, not a hype deck. Plain verbs, specific outcomes, sentence case.
No "AI-powered", no sparkles, no "revolutionary". The headline names the benefit
("Real-time video feedback for elite training"); subcopy says how in one breath ("Run the
call, rewind any moment, and show exactly where the form broke — with a live skeleton on
every athlete.").

## 5. Files to touch

- [ ] `app/page.tsx` — the landing (or split into section components under `app/(marketing)/`)
- [ ] `app/components/ui/*` — reuse Button, Card, Pill, SkeletonOverlay from DESIGN_00
- [ ] Optional `app/(marketing)/components/HeroMock.tsx` — the animated call-grid signature

## 6. Accessibility & performance

Keyboard-reachable nav and CTAs with visible focus; hero animation is decorative
(`aria-hidden`) and disabled under reduced motion; images/mocks are lightweight SVG/CSS (no
heavy video autoplay); text meets contrast on `canvas`. Lighthouse-clean.

## 7. Acceptance criteria

- `/` shows a real landing (logged-out) and redirects authenticated users to the dashboard.
- The hero communicates "live video + skeleton + replay" at a glance via the signature mock.
- Amber appears only on the DVR scrubber; emerald only on any "live" indicator.
- Responsive to mobile; reduced-motion respected; no invalid Tailwind classes.
