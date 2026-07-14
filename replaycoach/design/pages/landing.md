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

**Revised again 2026-07-14** (visual-sourcing pass): the first
visual-richness pass still read as repetitive — every section was the same
"small bordered box, one generated glyph, heading, paragraph" shape. This
revision replaces the single hand-drawn icon style with a real vendored
icon set (Phosphor duotone, `DESIGN_SYSTEM.md` §7.3) and breaks the
Features section's uniform card grid into three distinct full-width bands,
each dominated by a large real photograph (sourced per
`design/ASSET_SOURCES.md`) composited with a product mockup, per §7.1
method 4. A new full-bleed Editorial section is added as the page's single
largest photographic moment. Copy is unchanged throughout this pass — only
layout and visual assets change.

## Layout

Single-column page, sticky header, eight sections: hero, stat strip,
editorial photo band (new), demo showcase, three feature bands
(Signature/Replay/Rooms — replaces the old 3-card grid), how it works,
closing CTA, footer. Max content width `max-w-content` (1320px, up from
`max-w-6xl`/1152px), horizontal padding `px-6 lg:px-10` (up from flat
`px-8`) — see §3.1. The editorial band and each feature band break out of
the padded container to full viewport width for their photo (`w-full`,
no `max-w-content` wrapper on the outermost element), with an inner
`max-w-content` wrapper for the overlaid text — this is what makes them
read as full-bleed rather than "another card."

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

### Editorial — new full-bleed photo section

The single largest photographic moment on the page, placed between the
stat strip and the demo showcase to establish "this is a real film room
with real people in it" before the product-mockup-heavy sections that
follow. Full-viewport-width photo (`editorial-review.jpg` per
`ASSET_SOURCES.md`), `aspect-[21/9]` on desktop collapsing to `aspect-[4/5]`
on mobile (the photo has negative space on its left third by design, so a
tall mobile crop still reads correctly), a `canvas`-to-transparent gradient
overlay on the left side for text legibility (same technique as the
existing demo-showcase overlay), containing just an eyebrow label and a
one-line statement — no button here, this section's job is tone-setting,
not conversion (the CTA band at the page's end handles conversion). Wrapped
in `Reveal`.

### Demo showcase

Structurally unchanged (play-button card, opens `DemoVideoModal`) — gets
the hover-lift treatment from §4.1/§5.1
(`hover:-translate-y-1 hover:shadow-xl transition-all duration-200` on the
button itself, replacing the current bare `hover:scale-105` on just the
play icon).

### Feature bands — replaces the old 3-card grid entirely

The old `id="features"` 3-card grid (one large "Signature" card + two small
text-only cards) is replaced by **three full-width alternating bands**, one
per domain accent, each a real photograph (§7.1 method 4) composited with
a product mockup and a `TrackingIcon`/`RewindIcon`/`SquadIcon` (Phosphor
duotone, §7.3) — visual dominates each band, text is the secondary column,
matching the brief's "increase visual-to-text ratio significantly."
Alternating photo-left/photo-right rhythm across the three bands avoids the
monotony a single repeated layout would reintroduce even with better
assets.

1. **Signature — Tracked joints** (`session` accent, photo left on
   desktop): `signature-athlete.jpg` at real size (`aspect-[4/5]`,
   `lg:w-[45%]`), `SkeletonMotif` absolutely positioned on top of the photo
   (loosely aligned over the athlete's torso — the photo prompt specifies
   clear joint/silhouette visibility for exactly this composite), `Card`'s
   layered-depth treatment (§4.1) applied to the photo itself (`shadow-xl`,
   slight rotation) rather than to a bordered box. Text column: `TrackingIcon`,
   heading, existing paragraph copy, `JointReadout` chips (unchanged
   content from the prior revision, now sized larger to match the band's
   scale).
2. **Replay — Rewind without dropping the call** (`replay` accent, photo
   right): `replay-scrub.jpg` (`aspect-video`, `lg:w-[55%]`, the widest of
   the three since it's a landscape source), `ReplayScrubberMini` floats on
   top of the photo's negative space (upper-right third, per the photo
   prompt) using the same floating-chip technique as `HeroMock`'s `HIP_R`
   badge — `shadow-md`, slightly larger than its prior card-inline size.
   Text column: `RewindIcon`, heading, existing paragraph copy.
3. **Rooms — Bring the whole squad in** (`analytics` accent, photo left):
   `rooms-squad.jpg` (`aspect-[4/3]`, `lg:w-[50%]`), `RoomsGridMini` placed
   as a floating card at the photo's bottom-right corner (same floating
   technique as above, enlarged from its prior inline size). Text column:
   `SquadIcon`, heading, existing paragraph copy.

Each band: `Reveal`-wrapped, photo gets `hover:-translate-y-1
hover:shadow-xl transition-all duration-200` (the photo itself is not a
link, but the lift signals "this is a crafted visual, not a background
fill" — consistent with §5.1's hover-lift being reserved for intentional
visual weight, not just literal links, when nothing else on the page
would otherwise invite the eye to linger there). Until the photograph
files exist at their `ASSET_SOURCES.md` paths, each `<img>` falls back to
a `bg-panel-2` block at the same aspect ratio so the layout doesn't break —
the mockup/icon overlay still renders on top, so the section is never
fully empty even before photos are dropped in.

### How it works — was a bare 3-column numbered text list; each step gets
a visual per `DESIGN_SYSTEM.md` §7.1

Structure unchanged (3 numbered steps), each step's text is now paired with
a small visual above it, `Reveal`-wrapped with staggered delay:

1. **Go live** — `LiveTile`: a small video-tile mockup with a corner
   live-pulse dot (`animate-ping`, §5.1) — the second and last use of the
   ping effect on this page, capping total instances at two per §5.1. Step
   number is now paired with a small `BroadcastIcon` (Phosphor duotone,
   §7.3) in the `brand` token color, replacing the bare numeral as the
   only visual marker.
2. **Catch the moment** — reuses `ReplayScrubberMini` (same component as
   the Replay feature band, smaller size) — consistent visual vocabulary
   for "replay" across the page rather than a third bespoke asset. Paired
   with `RewindIcon`.
3. **Show the fix** — `AnnotationDrawDemo`: a small custom SVG (still
   frame outline + a curved annotation stroke) whose stroke animates via
   `stroke-dasharray`/`stroke-dashoffset` (`animate-stroke-draw`, new
   Tailwind keyframe, 3.2s loop: hold → draw → hold → reset) — the "GIF
   replacement" pattern from §7.1: shows a coach's mark being drawn without
   a rasterized asset. Paired with `AnnotateIcon`.

### Closing CTA / footer

Structurally unchanged. CTA band gains the hover-lift-adjacent treatment
implicitly via `Button`'s existing hover state (no change needed — it
already brightens on hover). Footer unchanged.

## States

Landing has no loading/error/empty states in the traditional sense (it's
static marketing content) — the one piece of dynamic behavior is the
mount-check redirect for already-authenticated users (`if (mounted && user)
return null`), which is unchanged. None of the visual components
(`StatStrip`, `JointReadout`, `ReplayScrubberMini`, `RoomsGridMini`,
`LiveTile`, `AnnotationDrawDemo`) are data-driven — they're static
illustrative mockups, so they have no loading/error states of their own.
The four `<img>` elements (editorial + three feature-band photos) degrade
to a flat `bg-panel-2` block at the same aspect ratio via `onError`, so a
not-yet-sourced photo (see `ASSET_SOURCES.md`) never produces a broken-image
icon or layout shift once the real file is dropped in.

## Responsive

- `lg:grid-cols-2` hero → single column below `lg`; `HeroMock` keeps a
  `max-w-md mx-auto` constraint **only** below `lg` (drops it at `lg`+, see
  Hero above).
- Stat strip: `grid-cols-3` at all sizes down to mobile (three short
  mono-figure pairs fit even at 375px width) — no responsive collapse
  needed.
- Editorial band: `aspect-[21/9]` → `aspect-[4/5]` below `lg` (see
  Editorial above).
- Feature bands: `lg:flex-row` (photo + text side by side, alternating
  `lg:flex-row-reverse` for the Replay band) → `flex-col` below `lg`, photo
  always first in the stacked mobile order (visual leads, text follows),
  full width at `100%` instead of the `lg:w-[45/55/50%]` desktop split.
- How-it-works: `md:grid-cols-3` → single column below `md`, each step's
  visual mockup scales with its column (fixed small pixel dimensions, e.g.
  `w-full max-w-[220px]`, so it doesn't stretch awkwardly full-width on
  mobile).

## Backend/data

None needed — landing is fully static content, no API calls beyond the
existing auth-mount-check. The stat-strip figures are hardcoded product
characteristics, not fetched from any endpoint. The four photographs are
static files under `public/images/landing/` (see `ASSET_SOURCES.md` for
sourcing status), not served from any API or CMS.
