# DESIGN 00 — Design System foundation (read first)

You are the design lead + frontend engineer turning **ReplayCoach** from redirect-stub
pages into a polished, premium **mini-SaaS**. This folder holds one brief per surface. This
file is the **foundation every other brief depends on** — build it first, because it defines
the tokens, fonts, and reusable components the page briefs assume exist.

**Read the existing code before you build.** These pages already exist and must be
*reshaped*, not rewritten from zero:
`app/page.tsx` (landing — currently just redirects), `app/(auth)/login|register/page.tsx`,
`app/dashboard/page.tsx` (role redirect), `app/(dashboard)/coach/{sessions,clips,students}`,
`app/(dashboard)/student/{sessions,clips}`, `app/session/[id]/page.tsx`. Foundation files:
`app/layout.tsx`, `app/globals.css`, `tailwind.config.ts`.

> This is the **visual** layer. Functional wiring (replay buffer, pose overlay data, end-
> meeting, etc.) lives in the `fix-briefs/` set. Where they overlap (the session room),
> build the design here and let the fix briefs handle behavior. Don't duplicate logic.

---

## The direction (decide once, apply everywhere)

**Product truth:** ReplayCoach is a *film room* for movement. Its two signature artifacts
are the **neon skeleton overlay** (pose telemetry) and the **DVR timeline** (instant
replay). The whole UI should feel like a precise, calm broadcast/editing tool — Linear/
Vercel restraint, Zoom/Meet spatial familiarity — with those two artifacts as the through-
line. Not "AI magic," not dashboards-for-dashboards: raw video, clean data, a scrubber.

### Color tokens (soft, merged dark — no hard black, no bright primaries)

| Token | Hex | Use |
|---|---|---|
| `canvas` | `#070B14` | app background (deep slate-navy, softer than pure black) |
| `panel` | `#0F1522` | cards, panels |
| `panel-2` | `#151C2C` | elevated / hover surfaces |
| `hairline` | `rgba(148,163,184,0.12)` | glass borders, dividers |
| `text` | `#E7ECF5` | primary text |
| `muted` | `#8A94A7` | secondary text |
| `faint` | `#5A6478` | captions, disabled |
| `indigo` | `#6366F1` | primary interactive |
| `violet` | `#8B5CF6` | gradient partner / skeleton |
| `amber` | `#FBBF24` | **replay/DVR only** — playhead, scrubber, timecode |
| `emerald` | `#34D399` | live / active-speaker / success |
| `danger` | `#F87171` | leave / destructive |

Accent gradient: `linear-gradient(135deg,#6366F1,#8B5CF6)`. Reserve **amber strictly for
replay/DVR** so its appearance always means "you're in the past." Reserve **emerald** for
"live/now." That color grammar is the product's clarity — don't dilute it.

### Type (deliberate pairing, not the default UI-font-everywhere)

- **Display — Space Grotesk** (600/700): hero, section titles, big numbers. Technical,
  slightly mechanical — reads like instrumentation, fits biomechanics.
- **UI/Body — Inter** (400/500/600): all interface text.
- **Data/Mono — JetBrains Mono** (500): telemetry readouts, joint angles, timecodes,
  session IDs, stat figures. This is a signature — numbers and telemetry are *always* mono,
  which makes data feel measured and instrument-like.

Load via `next/font/google` in `app/layout.tsx` and expose as CSS variables
(`--font-display`, `--font-sans`, `--font-mono`). Type scale (rem): 3.5 / 2.25 / 1.5 / 1.125
/ 1 / 0.875 / 0.75, line-heights tight on display (1.05–1.1), relaxed on body (1.5).

### Shape, depth, motion

- Radii: `sm 8px`, `md 12px`, `lg 16px`, `pill 9999px`. Spacious padding; never cramped.
- **Glassmorphism** for overlays/panels: `background: rgba(15,21,34,0.6)` +
  `backdrop-filter: blur(12px)` + `1px solid var(--hairline)`. Use for the control dock,
  participant labels, replay sidebar, auth card, dropdowns.
- Glow (use sparingly, on focus/active only): `0 0 40px -12px rgba(99,102,241,0.55)`.
- Ambient background: 1–2 large, very soft radial gradients (indigo/violet) fixed behind
  content at ~8–12% opacity. Atmosphere, not decoration. No hard edges.
- Motion: 150–250ms `ease-out`; mount = fade + 4–8px rise; hover = 1px lift + border
  brighten. Respect `prefers-reduced-motion` (disable transforms/keyframes).

### The one signature

**Neon skeleton, drawn thin and glowing** — indigo→violet gradient strokes (1.5–2px) with a
soft `drop-shadow`, joints as small filled dots. It's the hero of the landing, the live
overlay in the room, and the visual motif for analytics (line charts use the same neon-line
language). Everything else stays quiet so this reads.

---

## Build the foundation

### 1. `tailwind.config.ts` — extend the theme (don't fight it with arbitrary values)

Add the palette, fonts, radii, blur, glow, and keyframes to `theme.extend` so pages use
real classes (`bg-panel`, `text-muted`, `border-hairline`, `font-display`, `shadow-glow`,
`animate-rise`). Example shape:

```ts
theme: {
  extend: {
    colors: {
      canvas: '#070B14', panel: '#0F1522', 'panel-2': '#151C2C',
      hairline: 'rgba(148,163,184,0.12)',
      ink: { DEFAULT: '#E7ECF5', muted: '#8A94A7', faint: '#5A6478' },
      brand: { indigo: '#6366F1', violet: '#8B5CF6' },
      replay: '#FBBF24', live: '#34D399', danger: '#F87171',
    },
    fontFamily: {
      display: ['var(--font-display)', 'sans-serif'],
      sans: ['var(--font-sans)', 'sans-serif'],
      mono: ['var(--font-mono)', 'monospace'],
    },
    borderRadius: { sm: '8px', md: '12px', lg: '16px' },
    boxShadow: { glow: '0 0 40px -12px rgba(99,102,241,0.55)' },
    backdropBlur: { glass: '12px' },
    keyframes: {
      rise: { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
    },
    animation: { rise: 'rise 0.25s ease-out both' },
  },
}
```

### 2. `app/layout.tsx` — fonts + base chrome

Load Space Grotesk, Inter, JetBrains Mono via `next/font/google`; attach their
`.variable`s to `<html>`; set `<body class="bg-canvas text-ink font-sans antialiased">`.
Add the ambient radial background here (a fixed, `-z-10`, `pointer-events-none` div) so it
sits behind every route.

### 3. `app/globals.css` — tokens + component recipes

Under the Tailwind directives, define CSS variables mirroring the tokens, base styles
(selection color, focus-visible ring in indigo, scrollbar), and a small set of reusable
component classes with `@apply` so pages stay clean and consistent:
`.glass`, `.card`, `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.pill`,
`.pill-live`, `.pill-replay`, `.input`, `.stat`, `.sidebar-link`. Every page brief assumes
these exist.

### 4. Kill the broken color classes (ties to `fix-briefs/FIX_11`)

The current pages use ~18 invalid Tailwind shades (`bg-slate-850`, `text-slate-350`, …)
that render as *no color*. As you reshape each page onto these tokens, replace those with
tokens/valid shades. After the redesign, this grep must return nothing:
```bash
grep -rInE '(bg|text|border|from|to|ring)-(slate|red|indigo|amber|emerald|green)-[0-9]{3}' app \
  | grep -vE '\-(50|100|200|300|400|500|600|700|800|900|950)\b'
```

### 5. App shell (shared by all dashboard pages)

Build one shell used by every `(dashboard)` route: a **left sidebar** (logo, primary nav,
role-aware links, user chip at bottom) + a **slim top bar** (page title, search, invite/
create action, notifications, avatar). Put it in a shared layout
(`app/(dashboard)/layout.tsx`) so coach/student sub-pages inherit it. Details in
`DESIGN_03`.

---

## Component inventory (build once, reuse)

Create `app/components/ui/` and implement these as small typed components so pages compose
them (each brief references them by name): `Button`, `IconButton`, `Card`, `GlassPanel`,
`StatCard` (with mini sparkline), `Pill` (variants: live / scheduled / ended / replay),
`Input`, `Avatar`, `Sidebar`, `Topbar`, `SkeletonOverlay` (visual), `Sparkline` (inline
SVG), `Chart` wrappers. Charts: use **Recharts** for the larger analytics graphs
(`pnpm add recharts`) and hand-rolled inline SVG for sparklines (no dependency for tiny
inline lines).

---

## The brief set (build in this order)

| # | Brief | Surface |
|---|-------|---------|
| 00 | `DESIGN_00_SYSTEM.md` | tokens, fonts, shell, components (**this file — first**) |
| 01 | `DESIGN_01_LANDING.md` | marketing landing `/` |
| 02 | `DESIGN_02_AUTH.md` | `/login`, `/register` |
| 03 | `DESIGN_03_DASHBOARD.md` | coach analytics dashboard + shell + sub-pages |
| 04 | `DESIGN_04_SESSION_ROOM.md` | live meet + DVR replay room |

## Quality floor (every page)

Responsive to mobile; visible keyboard focus (indigo ring); `prefers-reduced-motion`
respected; real copy (see each brief — no lorem, no "AI-powered ✨" filler); color grammar
honored (amber = replay, emerald = live); no invalid Tailwind classes. Ship each page, then
look at it and remove one thing that isn't earning its place.
