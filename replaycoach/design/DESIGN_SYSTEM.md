# ReplayCoach Design System

**Status: supersedes `design_html/*.dc.html` and the indigo/violet dark-only token
system shipped earlier today (2026-07-14) in `apps/web/tailwind.config.ts` /
`apps/web/app/globals.css`.** Those files used a stock dark-canvas +
indigo→violet gradient system — exactly the "AI dashboard" look this doc
replaces. Every hex value in this document is final. Every contrast ratio
below was computed with the WCAG relative-luminance formula, not eyeballed —
see the verification note under each table.

## Design language statement

ReplayCoach is a film room, not a SaaS dashboard. The reference point is
broadcast/editing-suite tooling and athletic performance data, not generic
productivity software: warm, tactile surfaces; confident editorial
typography; a small number of purposeful accent colors, each doing one job.
Nothing here should read as "default AI dashboard" — no indigo/violet
gradients, no icon-in-a-circle feature grids, no interchangeable card walls.

---

## 1. Color

### 1.1 Neutral tokens (theme-switchable)

All neutrals are **warm**, never a cold gray. Light is a tinted stone/cream,
never `#FFFFFF` as the page background. Dark is a true near-black with a
warm (not blue/purple) undertone.

| Token | Light | Dark | Usage |
|---|---|---|---|
| `color-canvas` | `#F7F3EE` | `#0A0908` | Page background |
| `color-panel` | `#FFFFFF` | `#161410` | Card / modal / primary surface |
| `color-panel-2` | `#F0EAE1` | `#211C16` | Nested surface: inputs, table head, pills' resting bg |
| `color-hairline` | `rgba(42,33,24,0.12)` | `rgba(255,250,240,0.10)` | Borders, dividers |
| `color-ink` | `#2A2118` | `#F3EEE6` | Primary text |
| `color-ink-muted` | `#6B5D4F` | `#B3A692` | Secondary text |
| `color-ink-faint` | `#7A6D5C` | `#8A7F6E` | Tertiary/de-emphasized text, timestamps |

**Verified contrast (WCAG relative luminance, `(L1+0.05)/(L2+0.05)`):**

| Pair | Ratio | Result |
|---|---|---|
| Light `ink` / `canvas` | 14.30:1 | AAA |
| Light `ink` / `panel` | 15.80:1 | AAA |
| Light `ink-muted` / `canvas` | 5.75:1 | AA |
| Light `ink-muted` / `panel` | 6.36:1 | AA |
| Light `ink-faint` / `canvas` | 4.56:1 | AA (body text) |
| Dark `ink` / `canvas` | 17.23:1 | AAA |
| Dark `ink` / `panel` | 15.94:1 | AAA |
| Dark `ink-muted` / `canvas` | 8.32:1 | AAA |
| Dark `ink-faint` / `canvas` | 5.06:1 | AA (body text) |

All four text tokens clear the 4.5:1 body-text minimum in both themes — none
of them are "large-text only." Use `ink-faint` freely for regular-size
de-emphasized text (timestamps, helper copy), not just captions.

### 1.2 Domain accents

Three UI domains, three accents. Each accent is used for that domain's
primary actions, active states, and chart series — never borrowed by another
domain. This is the mechanism that satisfies "distinct but coherent visual
identity per section" without becoming five unrelated palettes.

| Domain | Token | Light | Dark | Used in |
|---|---|---|---|---|
| Brand / marketing / global chrome | `color-brand` | `#B14A28` (clay) | `#E2724A` | Landing, auth, primary nav CTA, primary buttons everywhere as the default |
| Live session / film room | `color-session` | `#1F6F6B` (petrol) | `#3FA39C` | Session room chrome, live video tile accents, annotation tools |
| Analytics / dashboards | `color-analytics` | `#8A6222` (ochre) | `#D9A94A` | Coach & student overview stat cards, charts, sessions/clips tables |

**Verified contrast (text/icon use, on that theme's `canvas`):**

| Token | Light ratio | Dark ratio |
|---|---|---|
| `color-brand` | 4.90:1 (AA) | 6.39:1 (AAA) |
| `color-session` | 5.36:1 (AA) | 6.57:1 (AAA) |
| `color-analytics` | 4.94:1 (AA) | 9.21:1 (AAA) |

**Button-fill contrast** (text color on a solid accent-filled button):

| Fill | Text | Light ratio | Dark ratio |
|---|---|---|---|
| `color-brand` | white (light) / `color-canvas` (dark) | 5.41:1 | 6.39:1 |
| `color-session` | white (light) / `color-canvas` (dark) | 5.92:1 | 6.57:1 |
| `color-analytics` | white (light) / `color-canvas` (dark) | 5.45:1 | 9.21:1 |

Rule: light-theme accent-filled buttons use white text; dark-theme
accent-filled buttons use `color-canvas` (near-black) text, because the dark
accents are bright/light tones on a near-black button, not the reverse.

### 1.3 Semantic accents

Cross-cutting meanings, used regardless of domain — never repurposed for
anything else.

| Meaning | Token | Light | Dark | Verified ratio (on canvas) |
|---|---|---|---|---|
| Live / success / approved | `color-success` | `#4C7A52` (moss) | `#6FAE76` | 4.51:1 / 7.57:1 |
| Danger / destructive / rejected | `color-danger` | `#A6362A` (brick) | `#E2695A` | 5.97:1 / 6.07:1 |
| Replay / DVR **only** — never anything else | `color-replay` | `#8F631C` (amber) | `#E8AC4E` | 4.79:1 / 9.89:1 |

`color-replay` is reserved strictly for replay/DVR UI (scrubber, "◍ Replay"
badges, replay buttons) — the same rule the old system had, carried forward
because it's a genuinely useful signal, not an "AI slop" pattern.

### 1.4 Data visualization palette

Six-category, colorblind-safe-oriented (verified distinguishable under
protanopia/deuteranopia simulation by hue separation, not just lightness).
Use in this exact order for the 1st through 6th series in any chart. Two
entries (`chart-blue`, `chart-plum`) exist **only** for chart-series use —
never as UI chrome, buttons, or brand accents, which is what keeps this from
violating the "no indigo/purple" rule: it's one muted, deliberately
desaturated categorical hue in a data-viz palette, not the app's dominant
gradient.

| Order | Token | Light | Dark |
|---|---|---|---|
| 1 | `chart-clay` | `#B14A28` | `#E2724A` |
| 2 | `chart-petrol` | `#1F6F6B` | `#3FA39C` |
| 3 | `chart-ochre` | `#8A6222` | `#D9A94A` |
| 4 | `chart-blue` | `#3E5C76` | `#7FA3C4` |
| 5 | `chart-moss` | `#4C7A52` | `#6FAE76` |
| 6 | `chart-plum` | `#6B4A6B` | `#A87BA8` |

**Chart rules:**
- Axis lines and gridlines: `color-hairline`, 1px.
- Axis labels: `color-ink-faint`, `font-mono`, 11px.
- Tooltip: `color-panel` background, `color-hairline` border, `shadow-md` (§6), `color-ink` text, 8px radius.
- Bar/line stroke width: 2px for line charts; bars get 2px `color-canvas`-colored gaps between them (never touching) so screen-reader/zoom users can distinguish adjacent bars without relying on hue alone.
- **Zero-data state (required for every chart):** do not render an empty axis grid or a flat line at 0 — render a centered message using the empty-state pattern (§9), inside the same bounding box the chart would occupy, so layout doesn't jump when data arrives. Real code:

```tsx
function ChartOrEmpty({ data, children }: { data: unknown[]; children: ReactNode }) {
  if (data.length === 0) {
    return (
      <div className="h-full min-h-32 flex items-center justify-center rounded-md bg-panel-2">
        <span className="text-sm text-ink-faint">No data for this period yet</span>
      </div>
    );
  }
  return <>{children}</>;
}
```

---

## 2. Typography

### 2.1 Families

| Role | Family | Fallback stack | Loading |
|---|---|---|---|
| Display (headlines, section titles) | **Fraunces** (variable, optical size axis) | `Fraunces, 'Iowan Old Style', 'Palatino Linotype', serif` | Self-hosted `next/font/local`, weights 500/600 (Regular optical-size), italic 500 for the one-off pull-quote pattern in §9 |
| Body / UI | **Inter** | `Inter, -apple-system, 'Segoe UI', sans-serif` | Self-hosted `next/font/local` (already vendored at `apps/web/public/fonts/Inter-latin.woff2`), weights 400/500/600 |
| Mono (telemetry, timecodes, IDs) | **JetBrains Mono** | `'JetBrains Mono', 'SF Mono', monospace` | Self-hosted (already vendored), weight 500 |

Fraunces is new — vendor it the same way the other three fonts already are
(see `apps/web/app/layout.tsx`'s existing `next/font/local` pattern): fetch
the variable woff2 from Google Fonts' CSS2 API for the two weights above,
save to `apps/web/public/fonts/Fraunces-latin.woff2`, wire a new `--font-display`
`localFont()` call replacing the current Space Grotesk one. This is an
editorial serif, not a geometric sans — the single biggest signal that this
product isn't another SaaS template.

### 2.2 Type scale

Every role, both themes use the same sizes (only color tokens differ).

| Role | Family | Size / line-height | Weight | Letter-spacing | Example use |
|---|---|---|---|---|---|
| Display XL | Fraunces | 3.75rem / 1.05 | 600 | -0.01em | Landing hero H1 |
| Display L | Fraunces | 2.5rem / 1.1 | 600 | -0.01em | Page-level H1 (dashboard, session room title) |
| Display M | Fraunces | 1.75rem / 1.15 | 500 | 0 | Section H2, modal titles |
| Display S | Fraunces | 1.375rem / 1.2 | 500 | 0 | Card group headers |
| Body L | Inter | 1.125rem / 1.6 | 400 | 0 | Landing subhead, empty-state copy |
| Body M | Inter | 0.9375rem / 1.55 | 400 | 0 | Default body/UI text |
| Body S | Inter | 0.8125rem / 1.5 | 400 | 0 | Secondary/meta text |
| Label | Inter | 0.75rem / 1.4 | 600 | 0.02em | Form labels, table headers (uppercase) |
| Button | Inter | 0.875rem / 1 | 600 | 0 | All button text |
| Mono | JetBrains Mono | 0.8125rem / 1.4 | 500 | 0 | Timecodes, IDs, stat figures |
| Mono S | JetBrains Mono | 0.6875rem / 1.4 | 500 | 0.04em | Uppercase eyebrow labels, badges |

Tailwind config mapping (add to `theme.extend.fontSize`):

```ts
fontSize: {
  'display-xl': ['3.75rem', { lineHeight: '1.05', letterSpacing: '-0.01em', fontWeight: '600' }],
  'display-l': ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.01em', fontWeight: '600' }],
  'display-m': ['1.75rem', { lineHeight: '1.15', fontWeight: '500' }],
  'display-s': ['1.375rem', { lineHeight: '1.2', fontWeight: '500' }],
},
```

---

## 3. Spacing

4px base unit, standard Tailwind scale used as-is (`p-1`=4px … `p-8`=32px) —
no new scale needed. Page-level content padding: `p-4` mobile, `p-7` desktop
(unchanged from current dashboard layout, it was already correct). Card
internal padding: `p-6`. Section gaps: `space-y-6` (24px) for stacked page
sections, `gap-5` (20px) for card grids.

---

## 4. Radius & elevation

**Radius is not uniform** — this is one of the "AI slop" tells to actively
avoid (Section 2 of the brief: "uniform rounded-xl on every element").

| Token | Value | Used on |
|---|---|---|
| `radius-sm` | 6px | Inputs, small buttons, badges/pills' *corners when not fully round* |
| `radius-md` | 10px | Cards, table containers |
| `radius-lg` | 16px | Modals, the hero video mock, large feature panels |
| `radius-full` | 9999px | Buttons (primary/ghost/danger), status pills, avatar circles |

Rule: interactive controls (buttons, pills) are fully round; content
containers (cards, modals, tables) use `sm`/`md`/`lg` by size, never `full`.
This variation in radius language is deliberate — it's what the brief calls
out as missing from generic templates.

### Shadows

| Token | Value (both themes — shadows stay dark/black, that's correct in light mode too) |
|---|---|
| `shadow-sm` | `0 1px 2px rgba(20,14,8,0.06)` |
| `shadow-md` | `0 8px 24px -8px rgba(20,14,8,0.16)` |
| `shadow-lg` | `0 24px 48px -16px rgba(20,14,8,0.24)` |
| `shadow-focus` | `0 0 0 3px rgba(177,74,40,0.25)` (brand-tinted focus ring, see §10) |

No `shadow-glow` carried forward — that neon-glow pattern belongs to the
superseded indigo/violet system.

---

## 5. Motion

| Type | Duration | Easing | Use |
|---|---|---|---|
| Micro (hover, focus) | 120ms | `ease-out` | Button/link hover, focus ring appear |
| Standard (enter/exit) | 200ms | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Toast/dropdown/tooltip enter |
| Modal | 240ms | `cubic-bezier(0.16, 1, 0.3, 1)` | Modal open (scale 0.96→1 + fade), matches a soft "settle" not a bounce |
| Page section reveal | 260ms | `ease-out`, 8px translate-Y | Content appearing after loading state resolves |
| Skeleton shimmer | 1.4s loop | `linear` | Loading placeholders |

Tailwind keyframes (replace the existing `rise`/`settle`/`shimmer` — same
names, new curves/timings to match this table):

```ts
keyframes: {
  rise: {
    '0%': { opacity: '0', transform: 'translateY(8px)' },
    '100%': { opacity: '1', transform: 'translateY(0)' },
  },
  settle: {
    '0%': { opacity: '0', transform: 'scale(0.96)' },
    '100%': { opacity: '1', transform: 'scale(1)' },
  },
  shimmer: {
    '0%': { backgroundPosition: '-200% 0' },
    '100%': { backgroundPosition: '200% 0' },
  },
},
animation: {
  rise: 'rise 260ms ease-out both',
  settle: 'settle 240ms cubic-bezier(0.16,1,0.3,1) both',
  shimmer: 'shimmer 1.4s linear infinite',
},
```

### `prefers-reduced-motion`

Global rule (goes in `globals.css`, replacing the existing block — same
mechanism, keep it):

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Every animation type above degrades to an instant state-change under this
rule — none of them convey information through motion alone (no
motion-only success/error signaling), so this is a complete, safe fallback
for all of them, not just a generic override.

---

## 6. Theming implementation

Same CSS-custom-property mechanism already built today
(`apps/web/app/globals.css` + `tailwind.config.ts`) — **keep the plumbing,
replace the values.** This is a deliberate reuse: the `rgb(var(--x) /
<alpha-value>)` pattern, the `data-theme` attribute on `<html>`, the
anti-FOUC inline script in `layout.tsx`, the Zustand `theme-store.ts`, and
`ThemeToggle.tsx` are all sound infrastructure — only the token *values*
were wrong (indigo/violet dark-only). Implementer: edit the existing
`:root` / `:root[data-theme='light']` blocks in place.

```css
:root {
  /* dark (default) */
  --color-canvas: 10 9 8;
  --color-panel: 22 20 16;
  --color-panel-2: 33 28 22;
  --color-ink: 243 238 230;
  --color-ink-muted: 179 166 146;
  --color-ink-faint: 138 127 110;
  --color-hairline: rgba(255, 250, 240, 0.10);
  --color-brand: 226 114 74;
  --color-session: 63 163 156;
  --color-analytics: 217 169 74;
  --color-success: 111 174 118;
  --color-danger: 226 105 90;
  --color-replay: 232 172 78;
}
:root[data-theme='light'] {
  --color-canvas: 247 243 238;
  --color-panel: 255 255 255;
  --color-panel-2: 240 234 225;
  --color-ink: 42 33 24;
  --color-ink-muted: 107 93 79;
  --color-ink-faint: 122 109 92;
  --color-hairline: rgba(42, 33, 24, 0.12);
  --color-brand: 177 74 40;
  --color-session: 31 111 107;
  --color-analytics: 138 98 34;
  --color-success: 76 122 82;
  --color-danger: 166 54 42;
  --color-replay: 143 99 28;
}
```

`tailwind.config.ts` color block (replace the existing one 1:1 — same
`rgb(var(...) / <alpha-value>)` pattern, new token names/count):

```ts
colors: {
  canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
  panel: 'rgb(var(--color-panel) / <alpha-value>)',
  'panel-2': 'rgb(var(--color-panel-2) / <alpha-value>)',
  hairline: 'var(--color-hairline)',
  ink: {
    DEFAULT: 'rgb(var(--color-ink) / <alpha-value>)',
    muted: 'rgb(var(--color-ink-muted) / <alpha-value>)',
    faint: 'rgb(var(--color-ink-faint) / <alpha-value>)',
  },
  brand: 'rgb(var(--color-brand) / <alpha-value>)',
  session: 'rgb(var(--color-session) / <alpha-value>)',
  analytics: 'rgb(var(--color-analytics) / <alpha-value>)',
  success: 'rgb(var(--color-success) / <alpha-value>)',
  danger: 'rgb(var(--color-danger) / <alpha-value>)',
  replay: 'rgb(var(--color-replay) / <alpha-value>)',
  chart: {
    clay: 'rgb(var(--chart-clay) / <alpha-value>)',
    petrol: 'rgb(var(--chart-petrol) / <alpha-value>)',
    ochre: 'rgb(var(--chart-ochre) / <alpha-value>)',
    blue: 'rgb(var(--chart-blue) / <alpha-value>)',
    moss: 'rgb(var(--chart-moss) / <alpha-value>)',
    plum: 'rgb(var(--chart-plum) / <alpha-value>)',
  },
},
```

(Add matching `--chart-*` RGB-triplet vars to both `:root` blocks in
`globals.css`, values from §1.4.)

**Migration note for the implementer:** every existing usage of
`brand-indigo`/`brand-violet` in the codebase (landing, session room, auth,
dashboards — built earlier today) maps to `brand` in most cases, but check
context: session-room-specific accents map to `session`, dashboard/chart
accents map to `analytics`. `bg-gradient-to-r from-brand-indigo to-brand-violet`
patterns become a **flat** `bg-brand` fill, not a new two-color gradient —
gradients-as-default-button-style is itself part of the forbidden pattern
set. `live`/`replay`/`danger` map directly to `success`/`replay`/`danger`
(same semantics, new hex values, `live` renamed to `success` for clarity).

---

## 7. Icons & illustration

**Icons:** keep [Lucide](https://lucide.dev) (already the project's icon
library, MIT-licensed, already in `package.json` — no new dependency).
Stroke width 1.75 (not the default 2) for a slightly finer, more editorial
line weight consistent with Fraunces' serif detailing. Size 16px inline with
body text, 20px for standalone nav/toolbar icons, never inside a filled
circle background as a decorative default (the forbidden "icon-in-a-circle
× 3" pattern) — icons sit directly on the surface color, or inside a real
functional button.

**Illustration:** no stock illustration packs. Where an illustration is
called for (empty states, §9), use a **custom single-color line-art SVG at
`color-ink-faint`**, drawn in-house, depicting something specific to the
moment (an empty film reel for "no clips yet," a paused play-button silhouette
for "no sessions yet") rather than a generic "nothing here" icon. Each
custom SVG must ship with an explicit dark-mode variant — see §7.1.

### 7.1 Dark-mode asset rule (hard requirement)

Every custom SVG/illustration must be authored with **two real stroke/fill
color values**, selected via the CSS-variable token (`currentColor` set from
`text-ink-faint`, which already flips per theme) — **never** a CSS
`filter: invert()` or `mix-blend-mode` hack. Because every illustration in
this system is single-color line art keyed to `color-ink-faint`, this
requirement is satisfied automatically by using `stroke="currentColor"` and
wrapping the SVG in an element with the right text-color class — implementer
must still verify each one renders correctly in both themes before marking
a page done (visually inspect, don't assume).

---

## 8. Components

Every component below: real code, both themes (token-driven, so one
implementation serves both), all states.

### 8.1 Button

```tsx
'use client';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type ButtonVariant = 'primary' | 'session' | 'analytics' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white dark:text-canvas hover:brightness-110',
  session: 'bg-session text-white dark:text-canvas hover:brightness-110',
  analytics: 'bg-analytics text-white dark:text-canvas hover:brightness-110',
  ghost: 'bg-panel-2 hover:bg-panel-2/70 text-ink border border-hairline',
  danger: 'bg-danger/10 hover:bg-danger/20 text-danger border border-danger/30',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, className = '', children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:shadow-focus ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
```

Note: `dark:text-canvas` here is the **one** legitimate use of Tailwind's
`dark:` variant in this codebase — it needs to react to the `data-theme`
attribute, not `prefers-color-scheme`, so add `darkMode: ['selector',
'[data-theme="dark"]']` to `tailwind.config.ts` (this was previously absent;
add it — everything else in this system uses CSS-variable tokens instead of
`dark:`, but button text color genuinely needs a theme-conditional swap
between two non-token colors: white vs. the canvas token).

States: default / hover (`brightness-110` on filled, `bg-panel-2/70` on
ghost) / focus (`shadow-focus` ring, see §10) / disabled (`opacity-50` +
`cursor-not-allowed`) / loading (spinner replaces nothing — sits alongside
label, button keeps its width so it doesn't jump).

### 8.2 Card

```tsx
import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  accent?: 'brand' | 'session' | 'analytics';
}

export function Card({ children, className = '', onClick, accent }: CardProps) {
  const interactive = Boolean(onClick);
  return (
    <div
      onClick={onClick}
      className={`relative bg-panel border border-hairline rounded-md p-6 shadow-sm ${
        interactive ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-150' : ''
      } ${className}`}
    >
      {accent && (
        <span
          aria-hidden
          className={`absolute left-0 top-4 bottom-4 w-[3px] rounded-full bg-${accent}`}
        />
      )}
      {children}
    </div>
  );
}
```

The optional `accent` left-edge bar is the "category-coded edge" pattern
from the brief (§1: "Cards need physical logic... category-coded edges") —
use it on dashboard stat cards and session-room cards to tie them to their
domain accent, omit it on neutral content cards (settings, plain lists).

### 8.3 Input

```tsx
'use client';
import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, id, className = '', ...props }, ref) => {
    const inputId = id ?? props.name ?? Math.random().toString(36).slice(2);
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-label text-ink-muted">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={`w-full bg-panel-2 border border-hairline rounded-sm px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-all duration-150 focus:outline-none focus-visible:border-brand focus-visible:shadow-focus ${
            error ? 'border-danger/50' : ''
          } ${className}`}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} role="alert" className="text-xs text-danger animate-rise">
            {error}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';
```

(Unchanged from the current implementation except `rounded-lg`→`rounded-sm`
per §4's radius rule, and focus ring token swap.)

### 8.4 Pill / Badge

```tsx
import type { ReactNode } from 'react';

type PillVariant = 'success' | 'scheduled' | 'ended' | 'replay' | 'danger';

interface PillProps {
  variant: PillVariant;
  children: ReactNode;
  pulse?: boolean;
  className?: string;
}

const variantClasses: Record<PillVariant, string> = {
  success: 'bg-success/10 text-success border-success/30',
  scheduled: 'bg-analytics/10 text-analytics border-analytics/30',
  ended: 'bg-hairline text-ink-muted',
  replay: 'bg-replay/10 text-replay border-replay/30',
  danger: 'bg-danger/10 text-danger border-danger/30',
};

export function Pill({ variant, children, pulse, className = '' }: PillProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${variantClasses[variant]} ${className}`}>
      {pulse && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" aria-hidden />}
      {children}
    </span>
  );
}
```

### 8.5 Modal

```tsx
'use client';
import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string; // e.g. 'max-w-md', 'max-w-2xl'
}

export function Modal({ title, onClose, children, maxWidth = 'max-w-md' }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidth} bg-panel border border-hairline rounded-lg shadow-lg animate-settle`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-hairline">
          <h2 className="text-display-s text-ink">{title}</h2>
          <button onClick={onClose} aria-label={`Close ${title}`} className="text-ink-muted hover:text-ink transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
```

Keyboard: Escape closes, focus trap should be added via a small `useFocusTrap`
hook (not written out here — implementer: any standard focus-trap-on-mount
pattern is fine, requirement is Tab/Shift+Tab cycles only within the modal
while open).

### 8.6 Nav (dashboard sidebar item)

```tsx
function NavItem({ href, label, icon, active, onClick }: { href: string; label: string; icon: ReactNode; active: boolean; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-sm text-sm transition-colors border-l-[3px] ${
        active
          ? 'bg-panel-2 text-ink font-medium border-brand pl-[10px]'
          : 'text-ink-muted hover:bg-panel-2 hover:text-ink border-transparent'
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
```

### 8.7 Table

```tsx
<div className="bg-panel border border-hairline rounded-md overflow-hidden">
  <table className="w-full text-left text-sm">
    <thead>
      <tr className="border-b border-hairline bg-panel-2 text-label text-ink-faint uppercase">
        <th className="px-5 py-3">Column</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-hairline">
      <tr className="hover:bg-panel-2/40 transition-colors">
        <td className="px-5 py-3.5 text-ink">Cell</td>
      </tr>
    </tbody>
  </table>
</div>
```

Unchanged structurally from the current implementation (it was already
sound) — only token names change.

### 8.8 Toast

```tsx
const VARIANT_STYLES: Record<'error' | 'success' | 'info', { className: string; icon: typeof Info }> = {
  error: { className: 'bg-danger/10 border-danger/30 text-danger', icon: AlertTriangle },
  success: { className: 'bg-success/10 border-success/30 text-success', icon: CheckCircle2 },
  info: { className: 'bg-panel border-hairline text-ink', icon: Info },
};
```

Same structure as the existing `ToastContainer.tsx` — only the variant color
mapping changes (`live`→`success` token rename), positioning/behavior
(bottom-right, 5s auto-dismiss, `animate-rise`) is unchanged and correct.

### 8.9 Tabs

```tsx
function Tabs({ items, active, onChange }: { items: { key: string; label: string }[]; active: string; onChange: (key: string) => void }) {
  return (
    <div role="tablist" className="flex gap-0.5 bg-panel-2 border border-hairline rounded-full p-0.5 w-fit">
      {items.map((item) => (
        <button
          key={item.key}
          role="tab"
          aria-selected={active === item.key}
          onClick={() => onChange(item.key)}
          className={`px-3.5 py-1.5 rounded-full text-xs font-mono transition-colors ${
            active === item.key ? 'bg-panel text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
```

(This is the existing coach-overview range-selector pattern, generalized
into a reusable component — it was already well-built, just inline; extract
it as shown here.)

---

## 9. Empty / loading / error / zero-result pattern

One shared shape, reused by every page doc in `design/pages/`:

```tsx
function StateBlock({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-16 border border-dashed border-hairline rounded-md">
      <div className="w-10 h-10 mx-auto mb-4 text-ink-faint" aria-hidden>{icon}</div>
      <h3 className="text-display-s text-ink mb-2">{title}</h3>
      <p className="text-sm text-ink-muted max-w-sm mx-auto mb-6">{body}</p>
      {action}
    </div>
  );
}

function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-14 bg-panel-2 rounded-md animate-shimmer bg-[length:200%_100%] bg-gradient-to-r from-panel-2 via-panel to-panel-2" />
      ))}
    </div>
  );
}

function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="bg-danger/10 border border-danger/30 text-danger rounded-md px-4 py-3 text-sm flex items-center justify-between gap-3">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="text-xs font-semibold underline decoration-dotted hover:text-ink transition-colors flex-shrink-0">
          Retry
        </button>
      )}
    </div>
  );
}
```

`StateBlock` is empty AND zero-result (same shape, different copy/icon —
noted per-page where the two need distinct copy). `SkeletonRows` replaces
every bare `Loader2 spin` loading state currently in the codebase — a real
skeleton, not a spinner-only placeholder, per the brief's requirement.
`ErrorBlock` adds a **Retry** action, which the current implementation
mostly lacks (errors currently just display and require a full page
refresh).

---

## 10. Accessibility (applies to every component above)

- **Focus states:** every interactive element gets `focus-visible:shadow-focus`
  (brand-tinted ring token, §4) — never `outline: none` without this
  replacement. Add to `globals.css`:
  ```css
  :focus-visible { outline: 2px solid rgb(var(--color-brand)); outline-offset: 2px; }
  ```
- **Keyboard navigation:** Modal (§8.5) traps focus + Escape-closes. Tabs
  (§8.9) are a real `role="tablist"`/`role="tab"` pattern — arrow-key
  navigation between tabs should be added if not already present in
  whatever tab implementation exists pre-redesign (check; the current
  coach-overview range selector is plain buttons, not a true tablist —
  upgrade it to match §8.9 exactly).
- **Semantic HTML/ARIA:** every custom modal needs `role="dialog"` +
  `aria-modal="true"` + `aria-label` (already partly done in today's
  session-room work — keep those, just re-verify colors). Every icon-only
  button needs `aria-label`. Status pills that convey meaning via color
  alone (§8.4) already also carry a text label — never color-only.
- **`prefers-reduced-motion`:** see §5 — global rule already fully
  specified there, covers every motion type in this doc.
