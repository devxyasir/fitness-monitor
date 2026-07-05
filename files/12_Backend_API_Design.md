# 12 — Backend API Design

## 1. Conventions

- REST over HTTPS, JSON payloads, versioned under `/api/v1/`.
- Auth via `Authorization: Bearer <access_token>` (see `06_Authentication_Authorization_RBAC.md`).
- Errors follow a consistent shape: `{ "statusCode": 403, "error": "Forbidden", "message": "...", "requestId": "..." }` (see `25` error handling notes folded into this doc's §5).
- Pagination via `?page=&limit=` with `X-Total-Count` response header for list endpoints.
- All mutating endpoints are idempotent-safe where feasible (e.g., session creation accepts an optional client-generated `idempotencyKey`).

## 2. Core Endpoints

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Email/password login |
| POST | `/auth/refresh` | Rotate tokens |
| POST | `/auth/logout` | Revoke refresh token |
| POST | `/auth/password/forgot` | Request reset |
| POST | `/auth/password/reset` | Complete reset |

### Users & Organizations
| Method | Path | Description |
|---|---|---|
| GET | `/users/me` | Current profile |
| PATCH | `/users/me` | Update profile |
| POST | `/organizations` | Create studio org |
| POST | `/organizations/:id/invite` | Invite a coach |

### Sessions
| Method | Path | Description |
|---|---|---|
| POST | `/sessions` | Create session (scheduled or instant) |
| GET | `/sessions` | List sessions (filter by role/date/status) |
| GET | `/sessions/:id` | Session details |
| POST | `/sessions/:id/join` | Get LiveKit join token (authorized participants only) |
| POST | `/sessions/:id/end` | Coach ends session |
| DELETE | `/sessions/:id/participants/:userId` | Coach removes a participant |

### Replay
| Method | Path | Description |
|---|---|---|
| POST | `/sessions/:id/replay/seek` | Coach requests a seek — returns signed playback manifest |
| POST | `/sessions/:id/replay/target` | Coach sets which student(s) receive the replay |
| POST | `/sessions/:id/replay/end` | Return targeted students to live |

### Clips & Annotations
| Method | Path | Description |
|---|---|---|
| POST | `/sessions/:id/clips` | Save current replay range as a Clip |
| GET | `/clips` | List clips (own or shared-with-me) |
| GET | `/clips/:id` | Clip details incl. annotations |
| POST | `/clips/:id/share` | Share clip with student(s) |
| GET | `/clips/:id/annotations` | Fetch annotations for a clip |

### Recordings
| Method | Path | Description |
|---|---|---|
| GET | `/sessions/:id/recordings` | List recordings for a session (coach/admin only) |
| GET | `/recordings/:id/download` | Signed download URL (permission + audit-logged) |

## 3. Pose Data (internal-facing, consumed mainly via WebSocket, REST for backfill/history)

| Method | Path | Description |
|---|---|---|
| GET | `/recordings/:id/pose?fromMs=&toMs=` | Fetch stored keypoints for a time range (used by replay UI to render historical skeleton) |

## 4. Request/Response Example — Replay Seek

```
POST /api/v1/sessions/8f2.../replay/seek
{
  "participantId": "student_uuid",
  "timestampMs": 184200
}

200 OK
{
  "manifestUrl": "https://cdn.example.com/signed/...m3u8?Expires=...",
  "resolvedTimestampMs": 184000,
  "expiresAt": "2026-07-04T10:15:00Z"
}
```

## 5. Error Handling Standards

| HTTP Code | Meaning | Example |
|---|---|---|
| 400 | Validation error | Malformed timestamp, missing field |
| 401 | Not authenticated | Missing/expired access token |
| 403 | Authenticated but not authorized | Student attempting `/replay/target` |
| 404 | Resource not found or not visible to requester (never leaks existence of resources the user can't access) | Session ID belonging to another coach |
| 409 | Conflict | Joining a session already ended |
| 422 | Semantic validation failure | Replay timestamp beyond current live position |
| 429 | Rate limited | Excessive login attempts |
| 500 | Unhandled server error | Logged with `requestId`, generic message returned to client (no stack traces exposed) |

- Global NestJS exception filter maps all errors to this shape; never leak internal stack traces or DB error messages to clients (see `16_Security_Guidelines.md`).
- Every response includes a `requestId` correlating to structured logs (`17_Logging_Monitoring_Observability.md`).

## 6. Input Validation

- DTOs validated via `class-validator`/`class-transformer` at the controller boundary — reject before touching business logic.
- Strict allow-listing of fields (no mass-assignment — extra/unexpected fields in a payload are stripped, not silently accepted).

## 7. Rate Limiting

| Endpoint group | Limit |
|---|---|
| `/auth/login` | 5/min per IP, 10/hour per account |
| `/auth/password/forgot` | 3/hour per email |
| General authenticated API | 100/min per user (NestJS `ThrottlerModule` + Redis store) |
| `/replay/seek` | 20/min per session (coach-driven, generous but bounded against abuse/bugs) |

## 8. Security Considerations

- Every session/clip/recording-scoped endpoint enforces resource-level authorization (`06_Authentication_Authorization_RBAC.md` §4) in addition to role checks.
- All list endpoints scoped server-side to the requester's visibility (never rely on client-side filtering of a broader dataset).

## 9. Common Pitfalls

- ❌ Returning 403 vs 404 inconsistently in a way that leaks resource existence to unauthorized users (standardize on 404 for "not visible to you," 403 only when existence is already known/expected, e.g., a student hitting a coach-only endpoint on their own valid session).
- ❌ Skipping DTO validation on WebSocket-originated actions that also have REST equivalents (both surfaces need equal rigor — see `11_WebSocket_Realtime_Architecture.md` §7).

## 10. Acceptance Criteria

- [ ] All endpoints documented here have OpenAPI/Swagger specs auto-generated from NestJS decorators.
- [ ] Every mutating endpoint has DTO validation with rejection tests for malformed/malicious payloads.
- [ ] Rate limits verified under load test (`18_Testing_Strategy.md`).
- [ ] No endpoint returns raw DB/ORM error messages to the client.
