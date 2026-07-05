# DESIGN 02 — Authentication (`/login` & `/register`)

**Surface:** `app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`.
**Depends on:** `DESIGN_00`. Keep all existing auth **logic/handlers intact** — this is a
visual reshape only (the auth flow is being fixed separately in `fix-briefs/FIX_01`).

---

## 1. Goal

A calm, premium sign-in that feels like entering a precise tool. One centered glass card on
the ambient dark canvas, with a subtle gradient border and inputs that glow indigo on focus.
Nothing playful, nothing heavy.

## 2. Layout

```
        ░ ambient radial glow (indigo/violet, very soft) ░
┌───────────────────────────────────────────────────────────┐
│  optional left rail (≥lg): brand + one line of value copy  │   ┌──────────────────┐
│  "The film room for movement."                             │   │  ◇ ReplayCoach    │
│  a faint static skeleton motif, low opacity                │   │  Welcome back     │
│                                                            │   │                  │
│                                                            │   │  Email  [_______]│
│                                                            │   │  Pass   [_______]│
│                                                            │   │  [ Log in ]      │  ← gradient
│                                                            │   │  ─── or ───      │
│                                                            │   │  [ Google ][ … ] │  ← flat social
│                                                            │   │  New here? Sign up│
│                                                            │   └──────────────────┘
└───────────────────────────────────────────────────────────┘
```

On `lg+` use a two-column split (brand rail left, card right); on small screens the card is
simply centered and the rail hides.

## 3. The card

- `.glass` surface, radius `lg`, generous padding (32–40px), **gradient border** via a
  1px indigo→violet ring (a padded gradient background behind a `panel`-filled inner, or a
  `border` + `bg-clip` trick — keep it subtle, ~40% opacity).
- Header: small gradient ◇ mark + `font-display` title ("Welcome back" / "Create your
  account") + one `muted` subline.
- Inputs: `.input` from DESIGN_00 — `panel-2` fill, hairline border, `muted` label above,
  and on focus a **soft indigo glow ring** (`shadow-glow` + border brighten), transitioning
  in ~150ms. Labels are plain ("Email", "Password"), not floating gimmicks.
- Primary button: full-width gradient "Log in" / "Create account", with a subtle press
  state and a loading spinner that replaces the label (reuse `Button` `loading` prop).
- Social: **flat** buttons (Google, and whatever's real), hairline border on `panel-2`, mono
  or sans label, provider glyph left. If social auth isn't implemented, either omit it or
  show it disabled with a small "coming soon" — don't fake a working button.
- Footer link: switch between login/register ("New here? Sign up" / "Have an account? Log
  in").

## 4. Validation & states (direction, not mood)

- Inline errors appear **below the field** in `danger`, with a 150ms fade/height transition
  — no layout jump. Message says what to do: "Enter a valid email", "Password must be at
  least 8 characters", not "Invalid input".
- Form-level failure (wrong credentials) shows a single calm banner at the top of the card:
  "That email and password don't match." Never blame the user, never leak which field was
  wrong for security.
- Success → route as the existing handler does; show the button loading state meanwhile.
- Disabled submit until required fields are non-empty.

## 5. Files to touch

- [ ] `app/(auth)/login/page.tsx` — reshape markup onto DESIGN_00 tokens/components
- [ ] `app/(auth)/register/page.tsx` — same; add the extra fields the current form has
- [ ] `app/(auth)/layout.tsx` (create if absent) — the centered/split auth shell + ambient bg
- [ ] `app/components/ui/{Input,Button}.tsx` — reuse

## 6. Accessibility

Real `<label htmlFor>` on every input; errors linked via `aria-describedby`; focus ring
visible; the whole form submittable by keyboard/Enter; the decorative skeleton motif is
`aria-hidden`. Password field has a show/hide toggle with an accessible name.

## 7. Do NOT touch

- Don't change auth handlers, field names, validation logic, or the submit/redirect flow —
  visual only. (Behavior is `fix-briefs/FIX_01`.)
- Don't store tokens anywhere new.

## 8. Acceptance criteria

- Centered glass card with gradient border and indigo focus glow; split rail on `lg+`.
- Errors animate in below fields with actionable copy; no layout jump.
- Login and register share one auth shell; existing auth logic still works.
- Responsive; keyboard-accessible; no invalid Tailwind classes.
