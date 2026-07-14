# Student Clips (`apps/web/app/(dashboard)/student/clips/page.tsx`)

## Purpose

Same `MeetingGroups`/`ClipCard`/`ClipPlaybackModal` stack as
`coach-clips.md`, minus the share modal (students don't share) and minus
the download-mode chooser (only a coach can trigger a re-export — see
`ClipPlaybackModal`'s `isCoach` prop, built earlier today, unchanged). Same
domain accent: **`color-session`**.

## Layout

Identical to `coach-clips.md` — this doc exists separately only because the
page component itself is separate (`student/clips/page.tsx` vs.
`coach/clips/page.tsx`), not because the visual spec differs. Apply every
retint from `coach-clips.md` (`ClipCard`, `MeetingGroups` header,
`ClipPlaybackModal`) identically here. The one behavioral difference
(`isCoach` not passed, so the mode-chooser branch never renders) is already
correct and unchanged by this redesign.

## States

Same four states as `coach-clips.md` — loading (`SkeletonCards`), error
(today already renders `error`, verified — swap for `ErrorBlock` +
`onRetry={fetchClips}`), empty (`StateBlock`, copy: "No clips shared with
you yet"), zero-result N/A.

## Responsive

Same grid as `coach-clips.md`, unchanged.

## Backend/data

None — `GET /clips` (student-scoped) already correct.
