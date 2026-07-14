# Landing (`apps/web/app/page.tsx`)

## Purpose

Convert a visiting coach/athlete into a signup. One strong idea: this is a
live film room, not a video-call app with a feature bolted on. The hero must
communicate that in the first viewport.

**Revised 2026-07-14** (visual-richness pass): the first implementation was
correct on tone/type/color but too text-only, too flat, and too narrow a
container for a marketing page. This revision keeps every section's copy
and structure, and adds: a wider container that relates to the viewport
edge, a real visual anchor in every section (no headline-paragraph-button
block standing alone), layered depth extended beyond the hero, and
purposeful scroll/hover motion. See `DESIGN_SYSTEM.md` §3.1, §4.1, §5.1,
§7.1 for the underlying tokens/patterns this page applies.

## Layout

Single-column page, sticky header, six sections: hero, stat strip, demo
showcase, features, how it works, closing CTA, footer. Max content width
`max-w-content` (1320px, up from `max-w-6xl`/1152px), horizontal padding
`px-6 lg:px-10` (up from flat `px-8`) — see §3.1.

### Header

Unchanged from the prior revision — `max-w-content` swapped in for
`max-w-6xl`, otherwise structurally identical (logomark, nav links, theme
toggle, log in / start free).

### Hero

Structurally the same two-column grid, three changes:

1. Container is `max-w-content` / `px-6 lg:px-10` (§3.1).
2. `HeroMock`'s wrapper drops `mx-auto max-w-md` at `lg` and above — it now
   extends toward the container's right edge instead of centering in its
   grid cell, so the composition actually relates to the page edge on wide
   viewports instead of floating in dead space.
3. `HeroMock` gains a **live-tracking pulse**: the existing `HIP_R 168°`
   floating chip gets a small `bg-session` dot with an `animate-ping` ring
   behind it (§5.1) — the one "this is happening right now" signal in the
   hero, used exactly once here.

### Stat strip — new section, replaces the plain "Used by coaching
programs at..." text line

The old logo-wall line was the hero's only nod to social proof, and it was
plain text. Replace it with three real product-capability stats
(`DESIGN_SYSTEM.md` §7.1 rule #3 — factual capabilities, never fabricated
usage numbers), each a mono figure + label pair in that concept's domain
accent, wrapped in `Reveal` with a staggered `delayMs`:

```tsx
const stats = [
  { value: '<150ms', label: 'Overlay latency, live', accent: 'session' },
  { value: '30s', label: 'Always-buffered replay window', accent: 'replay' },
  { value: '33', label: 'Tracked joints per athlete', accent: 'analytics' },
];
```

Rendered as a `grid-cols-3` row beneath the hero, `border-t border-hairline`
to separate it from the hero visually, each stat's figure in
`font-mono text-display-m` colored by its accent token.

### Demo showcase

Structurally unchanged (play-button card, opens `DemoVideoModal`) — gets
the hover-lift treatment from §4.1/§5.1
(`hover:-translate-y-1 hover:shadow-xl transition-all duration-200` on the
button itself, replacing the current bare `hover:scale-105` on just the
play icon).

### Features — extends the layered-depth language, adds a real visual to
every card (previously the two smaller cards were text-only)

Same three-card asymmetric grid (`lg:col-span-2 lg:row-span-2` signature
card + two smaller cards, one card per domain accent — already correct,
already not the forbidden icon-in-circle×3 pattern). What's new: the two
smaller cards get a representative mini mockup, not just copy, and all
three cards get `Reveal` (staggered) + hover-lift:

- **Signature (session):** existing `SkeletonMotif`, plus a new
  `JointReadout` row underneath it — two small mono stat pairs
  (`HIP_R 168°`, `KNEE_L 142°`) styled like the hero's floating chip but
  inline, reinforcing that the tracking is numeric/live data, not a static
  drawing.
- **Replay (replay accent):** new `ReplayScrubberMini` — a small
  non-interactive DVR scrubber (buffered-region fill + playhead dot,
  visually identical language to the real `ReplayPanel`/`.rc-scrubber`
  styling, just static) instead of a bare paragraph.
- **Rooms (analytics accent):** new `RoomsGridMini` — a 2×2 grid of tiny
  athlete tiles (flat `panel-2` rectangles with a corner initial) with one
  tile highlighted in `analytics`, representing "one room, whole squad."

All three visuals are built with existing tokens/components per
`DESIGN_SYSTEM.md` §7.1 method 1 (representative mockup, not a screenshot
file) — defined in a new `app/components/LandingVisuals.tsx`.

### How it works — was a bare 3-column numbered text list; each step gets
a visual per `DESIGN_SYSTEM.md` §7.1

Structure unchanged (3 numbered steps), each step's text is now paired with
a small visual above it, `Reveal`-wrapped with staggered delay:

1. **Go live** — `LiveTile`: a small video-tile mockup with a corner
   live-pulse dot (`animate-ping`, §5.1) — the second and last use of the
   ping effect on this page, capping total instances at two per §5.1.
2. **Catch the moment** — reuses `ReplayScrubberMini` (same component as
   the Replay feature card, smaller size) — consistent visual vocabulary
   for "replay" across the page rather than a third bespoke asset.
3. **Show the fix** — `AnnotationDrawDemo`: a small custom SVG (still
   frame outline + a curved annotation stroke) whose stroke animates via
   `stroke-dasharray`/`stroke-dashoffset` (`animate-stroke-draw`, new
   Tailwind keyframe, 3.2s loop: hold → draw → hold → reset) — the "GIF
   replacement" pattern from §7.1: shows a coach's mark being drawn without
   a rasterized asset.

### Closing CTA / footer

Structurally unchanged. CTA band gains the hover-lift-adjacent treatment
implicitly via `Button`'s existing hover state (no change needed — it
already brightens on hover). Footer unchanged.

## States

Landing has no loading/error/empty states in the traditional sense (it's
static marketing content) — the one piece of dynamic behavior is the
mount-check redirect for already-authenticated users (`if (mounted && user)
return null`), which is unchanged. None of the new visual components
(`StatStrip`, `JointReadout`, `ReplayScrubberMini`, `RoomsGridMini`,
`LiveTile`, `AnnotationDrawDemo`) are data-driven — they're static
illustrative mockups, so they have no loading/error states of their own.

## Responsive

- `lg:grid-cols-2` hero → single column below `lg`; `HeroMock` keeps a
  `max-w-md mx-auto` constraint **only** below `lg` (drops it at `lg`+, see
  Hero above).
- Stat strip: `grid-cols-3` at all sizes down to mobile (three short
  mono-figure pairs fit even at 375px width) — no responsive collapse
  needed.
- Features grid: unchanged from prior revision (`lg:grid-cols-3` → single
  column below `lg`).
- How-it-works: `md:grid-cols-3` → single column below `md`, each step's
  visual mockup scales with its column (fixed small pixel dimensions, e.g.
  `w-full max-w-[220px]`, so it doesn't stretch awkwardly full-width on
  mobile).

## Backend/data

None needed — landing is fully static content, no API calls beyond the
existing auth-mount-check. The stat-strip figures are hardcoded product
characteristics, not fetched from any endpoint.
