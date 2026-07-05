# ReplayCoach — Fix Briefs Index & Execution Plan

You (the AI coding agent) are working on **ReplayCoach**, a live remote-coaching
platform (Next.js web + NestJS API + Python FastAPI pose-service, Postgres, Redis,
LiveKit). A senior review found that several core features are built but
**disconnected or incorrect**, so the product does not yet work end-to-end.

This folder contains one focused brief per issue. Each brief is self-contained:
symptom, root cause with file/line evidence, the exact change, files to touch,
verification, and acceptance criteria. **Do them in the order below.** Do not skip
ahead — later fixes assume earlier ones are done.

---

## How to use these briefs (read this first)

1. **One brief at a time.** Open the brief, do only what it says, verify it with the
   "Verification" section, then stop. Do not refactor unrelated code.
2. **Evidence before editing.** Each brief cites exact files and line numbers as they
   were at review time. Line numbers may drift — always open the file and confirm the
   code matches the quoted snippet before editing. If it doesn't match, re-read the
   file and adapt; never blind-apply a diff.
3. **Respect the guardrails.** Each brief has a "Do NOT touch" list. Honor it.
4. **Keep changes minimal and typed.** This is a TypeScript strict-mode + typed-Python
   codebase with tests. After each change run the verification commands. Do not weaken
   types (`any`), delete tests, or disable lint to make something pass.
5. **If a brief's assumption is already false** (e.g. the code was already fixed), say
   so and stop rather than inventing new work.

---

## Repository map (orientation)

```
replaycoach/
├── apps/
│   ├── api/          # NestJS API (auth, sessions, realtime gateway, pose relay, media/egress)
│   │   └── src/
│   │       ├── auth/        # login, refresh-token rotation, cookies
│   │       ├── realtime/    # Socket.IO gateway + Redis adapter
│   │       ├── pose/        # pose relay (Redis stream → sockets + DB)
│   │       ├── media/       # LiveKit + egress (S3 recording)
│   │       ├── sessions/    # session lifecycle
│   │       └── database/    # entities + migrations
│   ├── web/          # Next.js 14 (App Router)
│   │   ├── app/session/[id]/…   # the live session room + replay
│   │   ├── lib/           # api-client, auth-client, socket-client, livekit-client
│   │   └── stores/        # Zustand stores (auth, replay, pose, annotation)
│   └── pose-service/ # Python FastAPI: worker.py (LiveKit subscriber), inference.py (ONNX)
└── packages/types/   # shared TS DTOs (@replaycoach/types)
```

**How to run the stack locally** (needed for verification):

```bash
# From replaycoach/
pnpm install
# Terminal 1 — API
pnpm --filter @replaycoach/api dev            # http://localhost:3001 (prefix /api/v1)
# Terminal 2 — Web
pnpm --filter @replaycoach/web dev            # http://localhost:3000
# Terminal 3 — Pose service
cd apps/pose-service && python -m uvicorn main:app --port 8100
# LiveKit dev server must be running at ws://localhost:7880 (devkey/secret)
# Redis + Postgres per apps/api/.env
```

---

## Pre-flight (do this ONCE before any brief)

**Security — urgent.** `apps/api/.env` contains real Supabase, Redis (Upstash), and
JWT secrets. Before anything else:

1. Confirm `.env`, `apps/api/.env`, `apps/web/.env.local`, `apps/pose-service/.env` are
   all listed in `.gitignore` and are **not** committed to the public repo:
   ```bash
   git ls-files | grep -E '\.env$|\.env\.local$' || echo "OK: no env files tracked"
   ```
2. If any are tracked, remove them from git history and **rotate every secret**
   (Supabase DB password, Upstash Redis token, `JWT_SECRET`, `JWT_REFRESH_SECRET`).
3. Never paste these secrets into code, logs, or commit messages.

Also delete stray scratch files that don't belong in the repo (they exist today):
`apps/api/test_db.js`, `apps/api/test_pg.js`, `apps/api/test_endpoints.js`,
`apps/api/src/tmp_redis_test.js`, `tmp_redis_test.js`, `apps/pose-service` model
binaries if committed. Confirm with the user before deleting anything.

---

## Execution order

| # | Brief | Issue | Why this order |
|---|-------|-------|----------------|
| 1 | `FIX_01_auth_session_persistence.md` | Users get logged out constantly | Blocks all testing — if you can't stay logged in, you can't verify anything else. Also a root cause of the WebSocket failure. |
| 2 | `FIX_02_websocket_connection.md` | Socket "failed to connect" | Realtime (pose overlay, replay sync, annotations) all ride on this. Depends on #1 (needs a valid token to connect). |
| 3 | `FIX_03_pose_pipeline_activation.md` | Skeletons never appear | Nothing starts the pose workers, so no keypoints ever flow. Pure wiring gap. |
| 4 | `FIX_04_rtmpose_inference_correctness.md` | Skeletons would be garbage even if they flowed | RTMPose output is decoded wrong (SimCC not handled) + wrong normalization. Fix the model so #3's data is correct. |
| 5 | `FIX_05_low_latency_replay_and_overlay.md` | Instant replay shows a black player; overlay lags | The replay video buffer doesn't exist; build the replay video path + fast skeleton overlay. |
| 6 | `FIX_06_database_performance.md` | DB is slow / will fall over | Pose ingest does 2 DB round-trips per frame. Batch + cache + index. |
| 7 | `FIX_07_scaling_concurrency.md` | Can't handle many sessions at once | Horizontal scale: pose-service fan-out, socket Redis adapter, Postgres pool tuning. |

### Additional issues found in review (meeting lifecycle + polish)

These are **independent** of the core 7 and can be scheduled flexibly. 08 and 09 are the
important ones for a real Zoom/Meet feel; 10 and 11 are smaller.

| # | Brief | Issue | Notes |
|---|-------|-------|-------|
| 8 | `FIX_08_end_meeting_room_lifecycle.md` | Ending a meeting doesn't disconnect anyone | No LiveKit `deleteRoom`; teardown relies on a socket event only. High impact + cost. Do after 02. |
| 9 | `FIX_09_presence_leave_tracking.md` | Leave never recorded; abandoned sessions record forever; no roster | Frontend never calls `/leave`; no room-empty cleanup. Do after 08. |
| 10 | `FIX_10_join_lobby_flow.md` | Pending student sees "Connection Failed" instead of a lobby; join has no token-refresh | UX/functional. Do after 01 + 02. |
| 11 | `FIX_11_ui_polish_tailwind.md` | ~18 invalid Tailwind classes render as no color | Cheap, visible everywhere. Any time. |

**Status:** Briefs 01, 02, 08, 09, 10, 11 are written. Core briefs 03–07 will be delivered
one at a time as each prior fix is completed and verified.

**Note on things that are NOT broken** (verified during review — do not "fix" these):
the `session_participants` table already has a unique `(sessionId, userId)` constraint;
egress is dev-safe (mock mode when LiveKit creds are absent); all gateway `emit*` methods
exist; screen-share is intentionally coach-only at the LiveKit grant level; auth crypto
(argon2, refresh rotation, reuse detection) is sound.

---

## Definition of "done" for the whole project

Two users (a coach and a student) join a live session; both see live video via LiveKit;
a skeleton overlay tracks the student in near-real-time; the coach clicks **Replay**,
everyone sees a synchronized replay with the skeleton, the coach scrubs/annotates and
students see it in sync; the coach saves a clip; sessions survive browser refresh
without logging out; and the system stays responsive with multiple concurrent sessions.
