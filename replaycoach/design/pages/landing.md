# Landing (`apps/web/app/page.tsx`)

## Purpose

Convert a visiting coach/athlete into a signup. One strong idea: this is a
live film room, not a video-call app with a feature bolted on. The hero must
communicate that in the first viewport.

## Layout

Single-column page, sticky header, four sections: hero, demo showcase,
features, closing CTA, footer. Max content width `max-w-6xl`, horizontal
padding `px-8` desktop / `px-4` mobile — unchanged from current structure,
it was already sound; only tokens/type/imagery change.

### Header

```tsx
<header className="sticky top-0 z-20 bg-panel/85 backdrop-blur-md border-b border-hairline">
  <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
    <div className="flex items-center gap-2.5">
      <Logomark className="w-6 h-6" /> {/* see Brandmark below, replaces the ◇-in-gradient-box */}
      <span className="text-display-s text-ink">ReplayCoach</span>
    </div>
    <nav className="hidden md:flex items-center gap-7">
      <a href="#features" className="text-ink-muted text-sm hover:text-ink transition-colors">Product</a>
      <a href="#how" className="text-ink-muted text-sm hover:text-ink transition-colors">How it works</a>
    </nav>
    <div className="flex items-center gap-3">
      <ThemeToggle />
      <Link href="/login" className="text-sm font-semibold text-ink border border-hairline rounded-full px-5 py-2.5 hover:bg-panel-2 transition-colors">Log in</Link>
      <Button href="/register">Start free</Button>
    </div>
  </div>
</header>
```

**Brandmark:** replace the current `◇` glyph in a gradient box with a real
custom mark — a single-stroke line-art skeleton "joint" motif (one small
filled circle with two thin lines crossing it at an angle, suggesting a
tracked joint), stroke `currentColor` at `text-brand`, 24×24 viewBox. This
is the one piece of bespoke iconography every other brand touchpoint reuses
(favicon, footer, auth rail, loading spinners) — draw it once as
`app/components/Logomark.tsx`:

```tsx
export function Logomark({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none" />
      <path d="M6 20l6-11 6 11" />
    </svg>
  );
}
```

Renders in `text-brand` (landing/global chrome) — this is intentionally the
*only* place using the raw joint glyph without full skeleton context; the
session room (§ `session-room.md`) has the real animated multi-joint
version.

### Hero

```tsx
<section className="relative max-w-6xl mx-auto px-8 pt-24 pb-16">
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
    <div className="animate-rise">
      <div className="font-mono text-xs tracking-[0.14em] text-brand uppercase mb-4">Live film room</div>
      <h1 className="font-display text-display-xl text-ink mb-5 text-balance">
        Real-time film review, built for the rep — not the meeting.
      </h1>
      <p className="text-ink-muted text-body-l leading-relaxed max-w-md mb-8">
        Run the session live, rewind any moment without dropping the call, and
        mark exactly where the form broke — with tracked joints on every athlete.
      </p>
      <div className="flex gap-3.5 flex-wrap">
        <Button size="lg">Start free</Button>
        <Button variant="ghost" size="lg" onClick={() => setDemoOpen(true)}>
          <PlayIcon className="w-3.5 h-3.5" /> Watch demo
        </Button>
      </div>
      <div className="mt-12 flex items-center gap-5 flex-wrap">
        <span className="font-mono text-xs text-ink-faint uppercase tracking-widest">Used by coaching programs at</span>
        <span className="font-display text-display-s text-ink-faint">Ironforge Barbell</span>
        <span className="font-display text-display-s text-ink-faint">Meridian Track Club</span>
        <span className="font-display text-display-s text-ink-faint">Northline Gymnastics</span>
      </div>
    </div>
    <HeroMock />
  </div>
</section>
```

### `<HeroMock />` — replaces the old two-tile-plus-fake-skeleton mock

The current mock (two flat video-tile rectangles + a tiny SVG skeleton) is
generic. Real replacement: a single tilted card (physical logic per
`DESIGN_SYSTEM.md` §8.2 — "cards need physical logic, not just rounded
corners") showing one athlete tile with the actual joint-tracking motif at
real scale, rotated -2deg, with a second smaller card peeking out from
behind it at +3deg showing the DVR scrubber. This layered-stack composition
*is* the "physical logic" the brief asks for — two real objects, not a flat
grid.

```tsx
function HeroMock() {
  return (
    <div className="relative" style={{ transform: 'rotate(-2deg)' }}>
      <div
        aria-hidden
        className="absolute -right-6 -bottom-6 w-full h-full bg-panel-2 border border-hairline rounded-lg"
        style={{ transform: 'rotate(5deg)' }}
      />
      <div className="relative bg-panel border border-hairline rounded-lg p-4 shadow-lg">
        <div className="relative bg-panel-2 border border-hairline rounded-md aspect-[4/3] overflow-hidden">
          <SkeletonMotif className="absolute inset-0 w-full h-full" jointColor="session" />
          <span className="absolute left-3 bottom-3 text-xs text-ink bg-panel/80 backdrop-blur-sm rounded-full px-2.5 py-1 border border-hairline">
            Priya N. — Sprint mechanics
          </span>
        </div>
        <div className="mt-3 bg-panel-2 border border-hairline rounded-sm p-3">
          <div className="relative h-1 bg-replay/15 rounded-full mb-2">
            <div className="absolute left-0 top-0 bottom-0 w-[38%] bg-replay/40 rounded-full" />
            <div className="absolute left-[38%] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-replay" />
          </div>
          <div className="flex justify-between font-mono text-xs text-replay">
            <span>◍ 00:11.4 / 00:30.0</span>
            <span className="text-ink-faint">0.5×</span>
          </div>
        </div>
      </div>
      <div className="absolute -top-4 -right-4 bg-panel border border-hairline rounded-full px-3.5 py-1.5 font-mono text-xs text-ink shadow-md">
        HIP_R <span className="text-session">168°</span>
      </div>
    </div>
  );
}
```

`SkeletonMotif` is a real multi-joint line-art component (thin `color-session`
stroke, small filled joint dots, no glow/neon effect — that glow treatment
belonged to the superseded system) — full spec + code lives in
`session-room.md` since that's the canonical place it's used live; the
landing page imports the same component.

### Demo showcase & modal

Unchanged in structure/behavior from the current implementation
(`DemoVideoModal.tsx`, the play-button showcase card) — it already works
correctly and isn't part of the forbidden-pattern list. Retint only: swap
`bg-brand-indigo/violet` gradient references for a flat `bg-brand` overlay
tint, and the play-button circle from the indigo→violet gradient to solid
`bg-brand`.

### Features — replaces the icon-in-a-circle × 3 pattern

Forbidden pattern hit directly: current implementation is a 3-card grid,
each with a small icon inside a colored circle. Replace with an
asymmetric editorial layout — one large featured item + two smaller ones,
each keyed to a different domain accent (ties back to §1.2's "distinct
accent per section" rule, applied here as one card per accent rather than
one repeated formula):

```tsx
<section id="features" className="max-w-6xl mx-auto px-8 py-20">
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
    <Card accent="session" className="lg:col-span-2 lg:row-span-2 flex flex-col justify-between min-h-[320px]">
      <div>
        <span className="font-mono text-xs text-session uppercase tracking-widest">Signature</span>
        <h3 className="font-display text-display-m text-ink mt-3 mb-3">Tracked joints, not a filter</h3>
        <p className="text-ink-muted text-body-m leading-relaxed max-w-md">
          Every athlete gets real pose tracking during the live call — joint
          angles update in real time, and any annotation you draw follows the
          body instead of sitting on a fixed pixel.
        </p>
      </div>
      <SkeletonMotif className="w-40 h-48 self-end" jointColor="session" />
    </Card>
    <Card accent="replay">
      <span className="font-mono text-xs text-replay uppercase tracking-widest">Replay</span>
      <h3 className="font-display text-display-s text-ink mt-3 mb-2">Rewind without dropping the call</h3>
      <p className="text-ink-muted text-sm leading-relaxed">The last 30 seconds are always buffered — hit replay the instant something looks off.</p>
    </Card>
    <Card accent="analytics">
      <span className="font-mono text-xs text-analytics uppercase tracking-widest">Rooms</span>
      <h3 className="font-display text-display-s text-ink mt-3 mb-2">Bring the whole squad in</h3>
      <p className="text-ink-muted text-sm leading-relaxed">One room, one cued replay, every athlete watching the same frame at once.</p>
    </Card>
  </div>
</section>
```

### How it works / closing CTA / footer

Structurally unchanged (numbered 3-step list, centered CTA band, 3-column
footer) — retint tokens only: `text-brand` for the numeral labels
(currently `text-brand-violet`), `bg-brand` flat fill for the CTA button
(currently the indigo→violet gradient), footer stays neutral (`ink-muted`
links, no accent needed there).

## States

Landing has no loading/error/empty states in the traditional sense (it's
static marketing content) — the one piece of dynamic behavior is the
mount-check redirect for already-authenticated users (`if (mounted && user)
return null`), which is unchanged.

## Responsive

- `lg:grid-cols-2` hero → single column below `lg`, `HeroMock` centers and
  scales to `max-w-md` on mobile (add `mx-auto max-w-md lg:max-w-none` to
  its wrapper).
- Features grid: `lg:grid-cols-3` → single column below `lg`; the featured
  card's `lg:col-span-2 lg:row-span-2` naturally collapses to a full-width
  block first in the mobile stack, which is the correct reading order
  (signature feature first).
- Nav links (`Product`/`How it works`) already `hidden md:flex` — keep.

## Backend/data

None needed — landing is fully static content, no API calls beyond the
existing auth-mount-check.
