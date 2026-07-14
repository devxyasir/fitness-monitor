# Asset Sources

Catalog of every non-code-generated visual asset used on marketing pages,
per `DESIGN_SYSTEM.md` §7.3. Two categories: assets fetched programmatically
from a verified open-license source, and assets that need to be manually
generated/sourced and dropped into the repo (this environment has real
outbound HTTP access for fetching, but no access to Unsplash/Pexels'
search APIs, which require a registered API key neither present nor
appropriate to fabricate, and no image-generation model — so photography is
a manual step, documented below with exact prompts and destination paths).

---

## Icons — Phosphor Icons (duotone weight)

**Source:** [Phosphor Icons](https://github.com/phosphor-icons/core), fetched
via the [Iconify](https://iconify.design) API (`api.iconify.design`) at
build time, 2026-07-14.
**License:** MIT. **Attribution required:** No (MIT permits commercial use
without attribution; credited here anyway as good practice).
**Where vendored:** `apps/web/app/components/icons/index.tsx` — inlined as
React components (not runtime-fetched; same vendoring approach as the
self-hosted Fraunces font, so production has zero runtime dependency on
Iconify or Phosphor's CDN).

| Component | Phosphor icon | Used on |
|---|---|---|
| `BroadcastIcon` | `broadcast-duotone` | How it works — step 1 "Go live" |
| `RewindIcon` | `clock-counter-clockwise-duotone` | Replay feature section, how-it-works step 2 |
| `AnnotateIcon` | `pencil-simple-line-duotone` | How it works — step 3 "Show the fix" |
| `TrackingIcon` | `person-simple-run-duotone` | Signature (Tracked joints) feature section |
| `SquadIcon` | `users-three-duotone` | Rooms feature section |
| `LatencyIcon` | `lightning-duotone` | Stat strip — overlay latency |
| `BufferIcon` | `timer-duotone` | Stat strip — buffer window |

Duotone icons use `currentColor` for both the solid primary shape and a
20%-opacity secondary shape baked into the SVG (`opacity=".2"` attribute on
the secondary `<path>`) — a single `text-{token}` class colors the whole
icon consistently with the rest of the token system, no extra props needed.

---

## Photography — manual sourcing required

**Status: not yet in the repo.** This environment can reach real HTTP
endpoints (confirmed: npm registry, Unsplash's image CDN, Iconify all
reachable), but has no Unsplash/Pexels API key to *search* their catalogs
programmatically (their search endpoints require registered
authentication I don't have and won't fabricate), and no image-generation
model to produce new photography. Rather than guess at a specific stock
photo URL, source or generate these four images yourself and drop them at
the exact paths below — the code already references these paths, so
dropping a correctly-named file in makes it appear with no further changes.

**If sourcing from a stock library:** use Unsplash or Pexels (both free for
commercial use, no attribution legally required, though crediting the
photographer in the row below is good practice once you pick a real photo)
and update the "Actual source" column here with the photographer/URL.
**If generating with an AI image tool:** the prompts below are written for
that use case (Midjourney/Flux/DALL-E-style) — copy directly.

| # | Destination path | Aspect | Background removal |
|---|---|---|---|
| 1 | `apps/web/public/images/landing/editorial-review.jpg` | 16:9 landscape, ≥2400px wide | No — full environmental scene |
| 2 | `apps/web/public/images/landing/signature-athlete.jpg` | 4:5 portrait, ≥1800px wide | No — full scene, athlete does not need to be isolated (the joint-tracking overlay is composited on top in code, not cut around the subject) |
| 3 | `apps/web/public/images/landing/replay-scrub.jpg` | 16:9 landscape, ≥2000px wide | No — full scene |
| 4 | `apps/web/public/images/landing/rooms-squad.jpg` | 4:3 landscape, ≥2000px wide | No — full scene |

Format: `.jpg`, reasonably compressed (target under ~500KB each — these are
full-bleed marketing images, not thumbnails, but they shouldn't tax page
load). File extension and exact filename matter — the code references
these paths literally. 

### 1. Editorial review — `editorial-review.jpg`

> Cinematic editorial photograph, a coach and an athlete sitting side by
> side reviewing footage together on a laptop in a dim indoor training
> facility at dusk, warm low practical lighting (not fluorescent/clinical),
> shallow depth of field with the laptop screen glow lighting their faces,
> near-black warm-toned shadows, muted clay-orange and deep teal color
> accents in the environment (a training mat, equipment, or wall detail),
> documentary sports-photography style, not posed/stock-photo smiling —
> genuine focused expressions, wide negative space on the left third of the
> frame for text overlay, no visible text/logos/screens-within-screens,
> photographic (not illustrated/3D-rendered), 16:9.

**Used:** new full-width "editorial" section between the stat strip and the
Signature feature section — the single largest, most dominant photographic
moment on the page.

### 2. Signature athlete — `signature-athlete.jpg`

> Cinematic sports photograph of a single athlete mid-motion — sprinting
> out of blocks or mid-stride — captured with a slight motion blur on the
> trailing leg, shot against a plain dark near-black or deep charcoal
> background (studio or shadowed track), dramatic single-source side
> lighting that clearly separates the body's silhouette and major joints
> (shoulders, hips, knees, ankles clearly readable in the light), warm
> rim-light accent in clay-orange, high contrast, athletic-editorial
> photography (think a track-and-field brand campaign, not a smiling stock
> photo), vertical portrait framing with the athlete's full body visible
> and some headroom, no text/logos, photographic, 4:5.

**Used:** Signature (Tracked joints) feature section — the
`SkeletonMotif` joint-tracking overlay is composited on top of this photo
in code, aligned loosely over the athlete's body, so the clear
silhouette/joint visibility described above matters for that composite to
read correctly.

### 3. Replay scrub — `replay-scrub.jpg`

> Close-up cinematic photograph of a coach's hands scrubbing/interacting
> with a tablet or laptop trackpad in a dim gym or film room at night, the
> device screen slightly out of focus in the background casting a cool
> blue-white glow while the hands and foreground are lit warm (practical
> lamp or window light), shallow depth of field, moody near-black
> environment, documentary style, wide negative space in the upper-right
> third for a floating UI card to be composited on top in code, no visible
> screen content/text/logos, photographic, 16:9.

**Used:** Replay feature section — a `ReplayScrubberMini` product-UI card
floats on top of this photo (layered-depth pattern, §4.1), so leave clear
negative space per the prompt for that composite.

### 4. Rooms squad — `rooms-squad.jpg`

> Cinematic documentary photograph of a small team of 4-6 athletes
> together in a training space — mid-huddle, stretching together, or
> walking off a field/court as a group — genuine candid energy, not posed
> and smiling at camera, warm dusk/indoor practical lighting, near-black
> warm shadows, muted color palette with occasional clay-orange or teal
> accent (team gear, equipment), shot from a slight distance so the group
> dynamic reads clearly, photographic sports-editorial style, landscape
> framing with room for text/UI overlay in one corner, no visible
> text/logos, 4:3.

**Used:** Rooms feature section — reinforces "bring the whole squad in"
with a real group photo instead of only the small `RoomsGridMini` mockup
(mockup stays, now paired with real photography at larger scale).

---

## Illustrations

Not used in this pass. `DESIGN_SYSTEM.md` §7.3 method 1 (representative
code-built mockups: `SkeletonMotif`, `ReplayScrubberMini`, `RoomsGridMini`,
`LiveTile`, `AnnotationDrawDemo`) already covers every conceptual/UI-state
visual on the landing page — a separate illustration set (unDraw etc.)
would duplicate that role rather than add something new. Revisit only if a
future section needs a concept that doesn't map to any real product
surface (e.g. a billing/pricing page, which doesn't exist yet).
