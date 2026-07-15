# Handoff punch-list — dance rebrand cleanup, broken links, missing pages

**Scope for whoever picks this up: fix only what's listed here. Do not
push, deploy, or restart anything on the server — a separate session is
driving deploys for this product right now and will pick up your commits
when ready.** Work in this repo (`replaycoach/`), commit locally, and stop
there.

Context: ReplayCoach is being repositioned from a general "coaching
platform" to a dance/movement-focused product per
`design/CLIENT_COPY_REQUIREMENTS.md` (the client's copy doc — read it
first, it's the source of truth for tone and terminology). The landing
page (`apps/web/app/page.tsx`) and the top-level auth screens already got
a full pass this session. This document is everything **smaller** that's
left — the big architectural pieces (session creation flow, post-session
recording playback, RBAC fixes) were handled separately and are already
in `main`.

Use the existing design system throughout — don't invent new patterns.
Reference `design/DESIGN_SYSTEM.md` for tokens (colors, type scale,
spacing, the `Card`/`Button`/`Pill`/`Modal`/`Tabs`/`StateBlocks` component
library already in `apps/web/app/components/ui/`) and copy the structure
of an existing page in the same area (e.g. `apps/web/app/(dashboard)/coach/students/page.tsx`)
before building something from scratch. Every new page needs: a loading
state (`SkeletonRows`/`PageLoader`), an error state (`ErrorBlock` with
retry), an empty state (`StateBlock`), and to work in both light and dark
theme (it's all token-driven — if you use `bg-panel`/`text-ink`/etc.
instead of raw Tailwind colors, this is automatic).

---

## 1. Terminology pass (dance vocabulary, not fitness)

The client's mapping (`design/CLIENT_COPY_REQUIREMENTS.md`, bottom
section "Interface terminology replacements") lists fitness→dance term
swaps. Most of the codebase was already neutral (it never said "workout,"
"rep," "exercise," "trainer," etc. to begin with — verified by grep this
session), but do a **fresh, full grep** across `apps/web/app/**/*.tsx` for
each of these before assuming it's done, since new pages may have been
added since:

- `film room` / `Film Room` → `dance room` / `Dance Room` (already fixed
  on landing + auth screens — check dashboard, session room, and any new
  pages you touch)
- `athlete` → `dancer` or `performer` (already fixed in most places —
  re-check anything you add)
- `meeting` in **user-facing text** (buttons, dialogs, headings) →
  prefer `session` for consistency with the rest of the product. Leave
  internal variable/function names alone (`groupClipsByMeeting`,
  `clip.meeting?.startedAt`, etc.) — renaming those is a bigger, riskier
  refactor with no user-visible benefit; only change what a user reads.
- Any literal `workout`, `rep`, `exercise`, `trainer`, `calories`,
  `personal record`, `fitness` — flag and replace per the client's
  mapping table if you find any (none were found as of this handoff, but
  re-verify).

**Do not rename the underlying data model** (`UserRole` still has
`'coach'`/`'student'`, the `sessions` table stays `sessions`, etc.) — this
is a copy/label pass on user-facing strings only, not a schema migration.

## 2. Footer links go nowhere

`apps/web/app/page.tsx`, `FooterCol` component (~line 413): every footer
link renders `<a href="#">` — literally all of them, including "Privacy,"
"Terms," "Contact," "Product," "How It Works," "Features," "For Dancers,"
"For Coaches." Two different problems bundled together:

- **"Product" / "How It Works" / "Features" / "For Dancers" / "For
  Coaches"** should scroll to their matching landing-page section
  (`#features`, `#how`, `#for-dancers`, `#for-coaches` — the section IDs
  already exist in `page.tsx`, the footer just isn't wired to them). Fix:
  make `FooterCol` accept an optional `href` per link instead of hardcoding
  `href="#"`, and pass the real anchor for these five.
- **"Privacy" / "Terms" / "Contact"** have no pages to link to at all —
  see §3 below.

## 3. Missing pages

### `/settings` — linked, doesn't exist, 404s

`apps/web/app/(dashboard)/layout.tsx` links to `/settings` in the sidebar
nav (every logged-in user sees this link). There is no
`apps/web/app/settings/` or `apps/web/app/(dashboard)/settings/`
directory at all. Build a real settings page, not a stub. At minimum:

- **Profile**: display name, avatar (check `UserDto`/`UpdateUserDto` in
  `packages/types/src/user.ts` and `PATCH /users/:id`-equivalent — verify
  the actual endpoint in `apps/api/src/users/user.controller.ts` before
  assuming the shape) — a simple form, save via the existing `apiClient`.
- **Password change**: check whether the API has a change-password
  endpoint (`apps/api/src/auth/`) — if not, that's a backend gap to flag
  back to the main session rather than build around; don't fabricate an
  endpoint that doesn't exist.
- **Theme**: the site already has a working light/dark toggle
  (`ThemeToggle` component, `stores/theme-store.ts`) — surface it here too
  as a proper setting, not just the header icon.
- **Notifications/email preferences**: only build this if a real backend
  field exists to back it (check `User` entity / `OrgSettings`) — don't
  invent a toggle that doesn't persist anywhere.
- **Danger zone**: "Log out of all devices" if `sessionVersion` bump is
  exposed anywhere in the API (check `AuthService`/`UserService` for an
  existing "force logout" mechanism before building one).

Put it at `apps/web/app/(dashboard)/settings/page.tsx` so it inherits the
dashboard sidebar/topbar chrome (same pattern as
`apps/web/app/(dashboard)/coach/organization/page.tsx`, which was just
built this session — copy its structure: tabs if there's more than one
settings group, `Card` for each section, `ErrorBlock`/toast on save
failure).

### `/privacy`, `/terms`, `/contact` — linked from footer, don't exist

These need to exist before this product can go to a real client — footer
links to legal pages are typically a compliance requirement, and the
client doc's FAQ section (`design/CLIENT_COPY_REQUIREMENTS.md`, "Is my
footage private?") explicitly says: *"This section should clearly explain
video storage, sharing permissions, deletion and access controls before
launch."* That's not placeholder copy to skip — it needs real, accurate
content describing what this product actually does (check
`apps/api/src/media/`, `apps/api/src/reference/reference-storage.service.ts`,
and `Session.retentionDays` for the real facts: S3-backed storage,
signed/expiring playback URLs, org-scoped access, retention field exists
but isn't currently enforced by a cleanup job — say so accurately rather
than promising retention that doesn't actually happen yet).

Simple static pages are fine here (no data fetching) — follow the visual
pattern of the landing page's prose sections (`font-display` headings,
`text-ink-muted` body, `max-w-content` container).

### Check for other dead footer/nav links

Audit every `href` in `apps/web/app/page.tsx`'s header nav and footer,
and every link in `apps/web/app/(dashboard)/layout.tsx`'s sidebar, against
actual existing routes. List anything else you find dead in your PR
description so the next person doesn't have to re-discover it.

## 4. Broken buttons / dead-end flows to verify

These were true as of this handoff — some may already be fixed by the
time you start, check `git log` first:

- Any button/link using `?replay=true` on the old session-room route
  pattern — this was the old broken "Replay" link pattern (fixed this
  session by pointing at the new `/session/[id]/review` page instead).
  Grep for `replay=true` — if you find any remaining instances, they're
  stale and should point to `/session/${id}/review` too.
- Test every button on `/coach/students`, `/coach/clips`,
  `/student/clips` end-to-end (click through, don't just read the code) —
  these weren't specifically re-audited this session and may have stale
  links from before the design-system rewrite.

## 5. General QA pass

Once the above is done, click through the entire authenticated app as
both a coach and a student role (register two test accounts, or use the
invite flow at `/coach/organization` to invite a student) and note
anything that:

- 404s
- Shows a raw/unstyled error instead of the app's `ErrorBlock` pattern
- Has a loading state that's a bare spinner instead of the
  `SkeletonRows`/`PageLoader` pattern used everywhere else
- Looks visually inconsistent with the rest of the app (wrong font,
  wrong color, misaligned spacing)

Write these up as you find them rather than fixing silently — a running
list in your PR description is enough, doesn't need to be its own file.

---

## What NOT to touch

- `apps/web/public/media/demo.mp4` — the project owner manages this file
  directly, do not replace it.
- Anything under `.github/workflows/` — CI/CD is intentionally paused,
  not in scope.
- The LiveKit/docker-compose production credentials
  (`replaycoach/.env`, gitignored, server-local) — unrelated to this
  punch-list, already handled.
- Don't reach for any external/online asset-generation or stock-photo
  service — this environment doesn't have accounts for any of that. If a
  page needs an image, use the existing vendored assets under
  `apps/web/public/images/landing/` or ship text-only/icon-based (Phosphor
  duotone icons, see `apps/web/app/components/icons/index.tsx` and
  `design/DESIGN_SYSTEM.md` §7.3) rather than blocking on new imagery.
