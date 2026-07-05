# 05 — Database Design

## 1. ERD Overview

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ USERS : "employs coaches"
    USERS ||--o{ SESSIONS : "coaches"
    USERS ||--o{ SESSION_PARTICIPANTS : "joins"
    SESSIONS ||--o{ SESSION_PARTICIPANTS : has
    SESSIONS ||--o{ RECORDINGS : produces
    SESSIONS ||--o{ REPLAY_EVENTS : logs
    RECORDINGS ||--o{ POSE_KEYPOINT_FRAMES : "analyzed into"
    SESSIONS ||--o{ CLIPS : "saved from"
    CLIPS ||--o{ ANNOTATIONS : contains
    CLIPS ||--o{ CLIP_SHARES : "shared with"
    USERS ||--o{ CLIP_SHARES : receives
    USERS ||--o{ AUDIT_LOGS : generates
    ORGANIZATIONS ||--o{ SUBSCRIPTIONS : has

    USERS {
        uuid id PK
        string email
        string password_hash
        string role
        uuid org_id FK
        string display_name
        string avatar_url
        timestamp created_at
    }

    ORGANIZATIONS {
        uuid id PK
        string name
        string plan_tier
        timestamp created_at
    }

    SESSIONS {
        uuid id PK
        uuid coach_id FK
        uuid org_id FK
        string status
        string livekit_room_name
        timestamp scheduled_at
        timestamp started_at
        timestamp ended_at
        int retention_days
    }

    SESSION_PARTICIPANTS {
        uuid id PK
        uuid session_id FK
        uuid user_id FK
        string role_in_session
        timestamp joined_at
        timestamp left_at
    }

    RECORDINGS {
        uuid id PK
        uuid session_id FK
        uuid participant_id FK
        string track_type
        string s3_key_prefix
        string status
        int duration_seconds
        timestamp created_at
    }

    POSE_KEYPOINT_FRAMES {
        uuid id PK
        uuid recording_id FK
        int frame_timestamp_ms
        jsonb keypoints
        float confidence_avg
    }

    REPLAY_EVENTS {
        uuid id PK
        uuid session_id FK
        uuid initiated_by FK
        uuid target_participant_id FK
        int seek_timestamp_ms
        jsonb shared_with_user_ids
        timestamp created_at
    }

    CLIPS {
        uuid id PK
        uuid session_id FK
        uuid created_by FK
        int start_ms
        int end_ms
        string title
        string s3_key
        timestamp created_at
    }

    ANNOTATIONS {
        uuid id PK
        uuid clip_id FK
        uuid replay_event_id FK
        int frame_timestamp_ms
        string type
        jsonb geometry
        string text_content
        uuid created_by FK
        timestamp created_at
    }

    CLIP_SHARES {
        uuid id PK
        uuid clip_id FK
        uuid shared_with_user_id FK
        timestamp created_at
    }

    SUBSCRIPTIONS {
        uuid id PK
        uuid org_id FK
        string stripe_customer_id
        string plan
        int seat_count
        timestamp current_period_end
    }

    AUDIT_LOGS {
        uuid id PK
        uuid actor_user_id FK
        string action
        string resource_type
        uuid resource_id
        jsonb metadata
        inet ip_address
        timestamp created_at
    }
```

## 2. Table Notes

### `users`
- `role`: enum `coach | student | studio_admin | platform_admin`.
- `password_hash`: bcrypt/argon2 — never store plaintext (see `16_Security_Guidelines.md`).
- `org_id` nullable — students and independent coaches may not belong to an org (Assumption A1).

### `sessions`
- `status`: enum `scheduled | live | ended | processed | archived`.
- `livekit_room_name`: unique identifier used to correlate with the LiveKit media layer.
- `retention_days`: per-session override of org default retention (Assumption A7).

### `recordings`
- One row per participant per track (video/audio) per session — enables independent per-student replay/pose analysis (supports FR-5.1 targeting).
- `s3_key_prefix`: points to the HLS-style segment folder in S3, not a single file, since Egress writes rolling segments during a live session.
- `status`: enum `recording | finalizing | ready | failed`.

### `pose_keypoint_frames`
- Stores keypoints at a throttled interval (e.g., every 100–150ms, not every raw video frame) to bound storage/DB write volume — see `09_Pose_Detection_Service.md` §4.
- `keypoints` JSONB shape: `{ "nose": [x,y,score], "left_shoulder": [x,y,score], ... }` (COCO 17-keypoint format).
- Indexed on `(recording_id, frame_timestamp_ms)` for fast seek-time lookup.

### `replay_events`
- Audit + functional record of every replay action — who triggered it, which student's footage, what timestamp, who it was broadcast to (FR-5.2). Doubles as an analytics source ("which moves get replayed most").

### `annotations`
- `geometry` JSONB shape varies by `type` (`freehand | arrow | circle | rectangle | text`), e.g. arrow: `{"from":[x,y],"to":[x,y]}`.
- Anchored by `frame_timestamp_ms`, not raw pixel-only coordinates, satisfying FR-7.2 (annotations track the video content, not the viewport).

### `clips`
- A clip is a **materialized, permanently saved** replay range + its annotations, distinct from the ephemeral in-session `replay_events`.

## 3. Indexing Strategy

| Table | Index | Purpose |
|---|---|---|
| `sessions` | `(coach_id, status)` | Coach dashboard "my live/upcoming sessions" |
| `session_participants` | `(session_id, user_id)` unique | Prevent duplicate joins, fast membership check |
| `recordings` | `(session_id, participant_id)` | Fast per-student recording lookup during replay |
| `pose_keypoint_frames` | `(recording_id, frame_timestamp_ms)` | Seek-time keypoint retrieval |
| `clips` | `(session_id)`, `(created_by)` | History browsing |
| `audit_logs` | `(actor_user_id, created_at)`, `(resource_type, resource_id)` | Security investigation queries |

## 4. Read/Write Separation

- Writes (session state, joins, annotations) go to the primary.
- Session-history, reporting, and admin dashboard queries are routed to a read replica to avoid contending with live-session write traffic (see `03_System_Architecture.md` §6).

## 5. Data Retention & Deletion

- Scheduled job purges `recordings` past `retention_days` (moves to Glacier first per `14_File_Storage_Media_Pipeline.md`, then deletes DB rows referencing purged S3 objects after the archive window).
- Account deletion cascades: user's owned sessions' recordings scheduled for deletion, `pose_keypoint_frames` deleted, `audit_logs` retained in anonymized form for compliance (actor reference nulled, action retained) — balances GDPR "right to erasure" with security audit integrity.
