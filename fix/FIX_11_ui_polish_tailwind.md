# FIX 11 — Broken UI colors (invalid Tailwind classes) + meeting polish

**Priority:** Low–Medium (visible everywhere; cheap to fix). Independent; do any time.
**Apps touched:** `apps/web`

---

## 1. Symptom

Parts of the UI render with missing backgrounds/borders/text colors — buttons that look
transparent, headers with no contrast, panels that blend into the page. It looks broken
and unpolished, which undercuts the "professional Zoom-like tool" goal.

## 2. Root cause (with evidence)

The code uses **Tailwind color shades that don't exist.** Tailwind's default scale is
`50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950` — nothing in between. A class like
`bg-slate-850` or `bg-red-650` is **not generated**, so the element gets **no color at
all** (the class silently does nothing). A repo scan found these invalid classes in use:

```
bg-indigo-605   bg-indigo-650   bg-indigo-705
bg-red-550      bg-red-650
bg-slate-750    bg-slate-805    bg-slate-850
border-amber-505  border-green-550  border-indigo-805
border-slate-750  border-slate-805  border-slate-850
text-slate-205  text-slate-350   text-slate-450
```

They appear across `apps/web/app/session/[id]/**` (room, video grid, controls, exit modal)
and dashboard components.

## 3. The fix

### 3a. Replace every invalid class with the nearest valid shade
Read the `design` folder as well and read all design files to understand the design system. and implement it properly.
Do a careful find-and-replace across `apps/web`. Recommended mapping (round to the nearest
real step; pick the darker one for `x05`/`x50` mid-values to preserve intended contrast):

| Invalid | Use |
|---|---|
| `*-slate-205` | `*-slate-200` |
| `*-slate-350` | `*-slate-300` (or `-400` if it was meant as muted) |
| `*-slate-450` | `*-slate-400` |
| `*-slate-750` | `*-slate-700` |
| `*-slate-805` | `*-slate-800` |
| `*-slate-850` | `*-slate-800` (or `-900` for panel backgrounds) |
| `*-red-550` | `*-red-500` |
| `*-red-650` | `*-red-600` |
| `*-indigo-605` | `*-indigo-600` |
| `*-indigo-650` | `*-indigo-600` |
| `*-indigo-705` | `*-indigo-700` |
| `*-indigo-805` | `*-indigo-800` |
| `*-amber-505` | `*-amber-500` |
| `*-green-550` | `*-green-500` |

Apply the same base for every prefix (`bg-`, `text-`, `border-`, `from-`, `to-`, `ring-`).

**Find them all first** (so none are missed), then replace:
```bash
cd apps/web
grep -rInE '(bg|text|border|from|to|ring)-(slate|red|indigo|amber|emerald|green)-[0-9]{3}' . \
  | grep -vE '\-(50|100|200|300|400|500|600|700|800|900|950)\b'
```
After replacing, re-run that grep — it must return **nothing**.

### 3b. Prevent regressions

Add a guard so invalid shades can't creep back in. Two lightweight options:
- Enable Tailwind's `safelist`-free strictness by relying on the grep above in CI (add it
  as a `lint` step that fails if the pattern matches), **or**
- If you later move to arbitrary values intentionally (`bg-[#1b2536]`), do so explicitly
  rather than inventing scale steps.

### 3c. (Optional) Meeting polish that makes it feel like Meet/Zoom

Small, high-value additions once colors are fixed:
- **Reconnection banner:** use LiveKit's room state (`useConnectionState`) to show a
  "Reconnecting…" bar when the connection drops, instead of a frozen tile.
- **Connection-quality dot:** LiveKit exposes `ConnectionQuality` per participant — show a
  green/amber/red dot on each tile.
- **Mic/camera state on remote tiles:** show a muted-mic icon when a remote participant is
  muted (from track state), like Zoom.
- **Empty state:** the gallery already handles "no students"; make the coach's first-load
  state say "Waiting for students to join" with the invite link handy.

Keep 3c optional — do 3a/3b first; they're the actual bug.

## 4. Files to touch

- [ ] All of `apps/web` where invalid classes appear (primarily `app/session/[id]/**`, dashboard components) (**required**)
- [ ] CI lint step or Tailwind config note to prevent regressions
- [ ] (Optional) room UI for reconnection/quality/mute indicators

## 5. Verification

1. `grep` from 3a returns **zero** matches after the replace.
2. Visually: buttons, panels, borders, and text in the session room and dashboards all
   have their intended colors (no transparent/blended elements).
3. `pnpm --filter @replaycoach/web build` succeeds; no Tailwind warnings about unknown
   classes.
4. (If 3c done) Dropping the network briefly shows a "Reconnecting…" banner rather than a
   frozen frame.

## 6. Do NOT touch

- Don't change layout/spacing/structure while fixing colors — swap only the color shade so
  the diff stays reviewable.
- Don't introduce a custom color palette in `tailwind.config.ts` just to make the invalid
  names valid; use the standard scale.

## 7. Acceptance criteria

- No invalid Tailwind color classes remain (grep is clean).
- UI renders with correct, consistent colors throughout.
- Build is clean; a regression guard is in place.
