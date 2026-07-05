# 01 — Functional Requirements

Each requirement has an ID for traceability into the Antigravity Prompt Library (`23_Antigravity_Prompt_Library.md`) and test plans (`18_Testing_Strategy.md`).

## FR-1: Accounts & Organizations

| ID | Requirement |
|---|---|
| FR-1.1 | User can register as Coach or Student with email/password or OAuth (Google) |
| FR-1.2 | A Coach can belong to zero or one Studio (organization); Studio Admins can invite Coaches |
| FR-1.3 | A Student can be invited to a session by email or shareable link |
| FR-1.4 | Users manage profile (name, avatar, timezone) |

## FR-2: Session (Live Class) Management

| ID | Requirement |
|---|---|
| FR-2.1 | Coach can create a scheduled or instant session |
| FR-2.2 | Session supports 1 coach + 1..N students (group class capable) |
| FR-2.3 | Coach can generate a join link/code; students join via link or authenticated dashboard |
| FR-2.4 | Session has lifecycle states: `scheduled → live → ended → processed → archived` |
| FR-2.5 | Coach can remove a participant from a live session |
| FR-2.6 | Session automatically ends if the coach disconnects and does not rejoin within a grace period (default 5 min, configurable) |

## FR-3: Live Video

| ID | Requirement |
|---|---|
| FR-3.1 | All participants see live audio/video of each other (gallery + coach-focus layouts) |
| FR-3.2 | Coach can pin/spotlight a specific student's video |
| FR-3.3 | Video quality adapts to network conditions (simulcast) |
| FR-3.4 | Screen share supported for the coach (e.g., to show reference technique videos) |

## FR-4: Continuous Recording (Full-Session DVR)

| ID | Requirement |
|---|---|
| FR-4.1 | From the moment a session goes live, the system continuously records each participant's video track server-side |
| FR-4.2 | Recording persists for the full session duration; there is no rolling deletion during a live session |
| FR-4.3 | The coach can, at any time during the live session, open a "Replay" panel and **seek to any earlier point** in the current session for any participant |
| FR-4.4 | Seeking/scrubbing in the replay panel has a target latency of ≤3 seconds from "coach requests timestamp" to "frame visible" (see `02_Non_Functional_Requirements.md`) |
| FR-4.5 | After the session ends, the full recording (per participant + composite) is available in session history |
| FR-4.6 | Recordings are retained per the org's retention policy (default 90 days) then auto-archived (see `14_File_Storage_Media_Pipeline.md`) |

## FR-5: Replay Playback & Targeting

| ID | Requirement |
|---|---|
| FR-5.1 | Coach selects a student (in group sessions) and a timestamp/range to replay |
| FR-5.2 | Coach chooses who receives the replay: only themselves, or one/more specific students |
| FR-5.3 | Students **not** selected continue seeing the uninterrupted live feed |
| FR-5.4 | Replay supports play, pause, frame-step forward/back, slow-motion (0.25x/0.5x), and loop-segment |
| FR-5.5 | Coach can save a specific replay range as a named **Clip** for later reference |

## FR-6: Pose Detection (Skeleton Overlay)

| ID | Requirement |
|---|---|
| FR-6.1 | System detects body keypoints (head, shoulders, elbows, wrists, hips, knees, ankles) for each visible participant in near-real-time on the live feed |
| FR-6.2 | Skeleton overlay can be toggled on/off per viewer |
| FR-6.3 | Pose keypoints are also computed (or retrieved from cache) for recorded footage so the skeleton appears during replay too |
| FR-6.4 | Pose detection failure (e.g., person off-frame) degrades gracefully — video continues, skeleton simply disappears — it never blocks or crashes the session |
| FR-6.5 | The AI performs detection only. It does not score, judge, or generate feedback text. |

## FR-7: Annotation

| ID | Requirement |
|---|---|
| FR-7.1 | While a replay frame is paused, the coach can draw: freehand strokes, straight arrows, circles/ellipses, rectangles, and text labels |
| FR-7.2 | Annotations are anchored to the specific paused frame/timestamp, not to fixed screen coordinates (so they don't misalign if the view resizes) |
| FR-7.3 | Coach can undo/redo/clear annotations |
| FR-7.4 | Annotations broadcast in real-time to the target student(s) chosen in FR-5.2 |
| FR-7.5 | Annotations can optionally be saved together with a Clip (FR-5.5) |

## FR-8: Session History & Review

| ID | Requirement |
|---|---|
| FR-8.1 | Coach can browse past sessions, filter by student/date |
| FR-8.2 | Student can view their own past sessions and any Clips shared with them |
| FR-8.3 | Saved Clips (with annotations) can be re-watched outside of a live session |
| FR-8.4 | Coach can download a recording/clip (subject to permission and org policy) |

## FR-9: Notifications

| ID | Requirement |
|---|---|
| FR-9.1 | Student receives an email/in-app notification when invited to a session |
| FR-9.2 | Student receives a notification when a coach shares a Clip with them post-session |

## FR-10: Studio/Org Admin (if org tier enabled — see Assumption A1)

| ID | Requirement |
|---|---|
| FR-10.1 | Studio Admin can invite/remove coaches |
| FR-10.2 | Studio Admin can view aggregate session activity across coaches |
| FR-10.3 | Studio Admin manages seat/subscription limits (billing itself is out of scope per Assumption A6) |

## Out of Scope (v1)

- Automatic posture scoring / injury risk prediction
- LLM-generated coaching feedback
- Native mobile apps (responsive web only — Assumption A4)
- Real third-party Zoom/Meet/Teams integration
- Voice-command control of replay/annotation
