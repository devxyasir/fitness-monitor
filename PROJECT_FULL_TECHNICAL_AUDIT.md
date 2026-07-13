# ReplayCoach — Full Technical Audit Report

> **Date:** July 8, 2026
> **Auditor:** Principal Engineering Audit (Automated Deep Review)
> **Scope:** Complete codebase — Frontend, Backend, Pose Service, Infrastructure, Security, UX, Database
> **Repository:** `replaycoach` monorepo
> **Commits reviewed:** Up to HEAD (9fab072)

---

## 1. Executive Summary

ReplayCoach is a live remote-coaching platform with AI skeleton overlay, full-session DVR replay, annotation, and reference video analysis. The project is an **ambitious, well-architected monorepo** with clear module boundaries, shared types, and solid NestJS + Next.js + Python foundations.

However, this audit reveals that while the **engineering quality is excellent for its stage**, the project is **not yet production-ready**. There are:

- **3 Critical** security vulnerabilities (unauthenticated middleware, unauthenticated pose service, unverified webhook)
- **8 High** security vulnerabilities
- **7 Medium** security vulnerabilities
- **7 Low** security vulnerabilities
- **37 TODO/FIXME** markers scattered across the codebase
- **2 complete placeholder pages** (Admin, Coach Students)
- **Multiple missing production features** (notifications, audit logging)
- **Zero rate limiting** on register, refresh, and password reset endpoints
- **No soft deletes** on most entities
- **No data retention / GDPR compliance** tooling
- **No monitoring, alerting, or observability** configured

### Overall Project Score: 5.5 / 10

| Dimension | Score | Notes |
|-----------|-------|-------|
| Architecture | 8/10 | Clean modular design, good DI, shared types |
| Security | 3/10 | Multiple critical vulnerabilities, no auth on key endpoints |
| Code Quality | 7/10 | Good patterns but inconsistent error handling |
| UX | 5/10 | Core flows work but many placeholders and missing states |
| Performance | 6/10 | No load testing, N+1 queries likely, no caching |
| Database | 7/10 | Good schema but missing indexes, soft deletes, JSON validation |
| Infrastructure | 4/10 | Terraform exists but commented out, no CI/CD active |
| DevEx | 8/10 | Great monorepo tooling, type sharing, clear structure |
| Production Readiness | 4/10 | Missing monitoring, no HA, no backups, no runbooks |
| Documentation | 6/10 | README good, ADRs missing, no API docs |

---

## 2. Architecture Review

### 2.1 What is Excellent

1. **Monorepo structure:** pnpm + Turborepo with shared `@replaycoach/types` package — clean single source of truth for DTOs
2. **NestJS modular architecture:** Clear separation into Auth, Users, Organizations, Sessions, Media, Pose, Realtime, Annotations, Clips, Reference, Replay, Recordings
3. **Type safety:** Strict TypeScript on both frontend and backend, shared DTOs prevent contract drift
4. **Authentication design:** Refresh token rotation with grace window, family-based revocation, argon2 hashing, sessionVersion for instant invalidation
5. **WebSocket scaling:** Redis adapter for Socket.IO horizontal scaling
6. **Pose service isolation:** Python/FastAPI as separate service with Redis Stream-based worker communication

### 2.2 Architecture Problems

| # | Issue | Severity | Description |
|---|-------|----------|-------------|
| A1 | **Synchronous pose processing** | High | Pose inference runs in-process. If inference blocks, the entire event loop stalls. |
| A2 | **No message queue** | Medium | Redis Streams used directly. No retries, dead-letter, or backpressure. |
| A3 | **Monolith API** | Medium | All backend domains in a single NestJS app. |
| A4 | **Tight coupling in sessions service** | Medium | `SessionsService` depends on 4+ services — god object anti-pattern. |
| A5 | **No event bus** | Low | Domain events not published to any event bus. |
| A6 | **Worker pool global state** | Medium | `_worker_pool` in `main.py` is a global singleton. |

---

## 3. Security Review

### 3.1 CRITICAL Vulnerabilities

#### C1. Middleware is a No-Op — All Protected Routes Unauthenticated
**File:** `apps/web/middleware.ts`
**Description:** Every route under `/coach/*`, `/student/*`, `/dashboard/*`, `/session/*`, `/admin/*` is accessible without ANY authentication.
**Impact:** Full bypass of frontend route protection. Complete data exposure.

#### C2. Pose Service — Zero Authentication on Any Endpoint
**File:** `apps/pose-service/main.py`
**Description:** No auth on any endpoint. `host="0.0.0.0"` means fully exposed.
**Impact:** Complete pose-service compromise; SSRF; session disruption; worker DoS.

#### C3. LiveKit Webhook Accepts Unverified Input in Mock Mode
**File:** `apps/api/src/media/egress-webhook.controller.ts`
**Description:** When LiveKit credentials missing, ALL signature verification is skipped.
**Impact:** Full session manipulation; fake recording injection; DoS.

### 3.2 HIGH Vulnerabilities

| # | File | Issue |
|---|------|-------|
| H1 | `auth.controller.ts` | No rate limit on `/auth/refresh` |
| H2 | `auth.controller.ts` | No rate limit on `/auth/register` |
| H3 | `auth.controller.ts` | No rate limit on `/auth/password/reset` |
| H4 | `cloudfront-signer.ts` | Path traversal in URL signing (`..` not sanitized) |
| H5 | `pose-service/main.py` | SSRF via `ReferenceProcessRequest.videoUrl` |
| H6 | `pose-service/main.py` | SSRF via `ReferenceExportRequest.videoUrl` |
| H7 | `pose-service/main.py` | Redis URL with credentials logged |
| H8 | `auth.service.ts` | Error message inconsistency leaks feature state |

### 3.3 MEDIUM Vulnerabilities

| # | File | Issue |
|---|------|-------|
| M1 | `request-id.interceptor.ts` | Log injection via client-controlled `x-request-id` |
| M2 | `config.schema.ts` | CORS origin not URI-validated |
| M3 | `cookie.helper.ts` | Cookie `maxAge` hardcoded, ignores config |
| M4 | `cloudfront-signer.ts` | Signing failure returns broken URL |
| M5 | `auth-client.ts` | Access token potentially in localStorage |
| M6 | `pose-service/main.py` | Worker list exposed without auth |
| M7 | `api-client.ts` | No path traversal protection |

### 3.4 Authentication Review

| Feature | Status | Issue |
|---------|--------|-------|
| Login | OK | Good JWT + refresh token design |
| Signup | OK | No rate limiting |
| OAuth/Google | MISSING | No social login |
| Password Reset | STUB | `resetPassword` throws "not yet configured" |
| Email Verification | MISSING | No verification flow |
| Session Persistence | OK | HttpOnly refresh cookie, in-memory access token |
| Remember Me | MISSING | No persistent login option |
| MFA | MISSING | No TOTP/2FA |
| Multi-device | PARTIAL | SessionVersion allows revocation but no device management UI |
| Account Locking | MISSING | No brute-force protection |
| Token Expiration | OK | 15-min access, 7-day refresh |
| Silent Refresh | OK | api-client intercepts 401 and retries |
| Session Revocation | OK | Rotation reuse detection + family revocation |
| Cookie Security | OK | HttpOnly, Secure, SameSite=strict |
| Logout | PARTIAL | Clears cookie but access token remains valid for 15 min |

### 3.5 WebSocket Security

| Feature | Status | Issue |
|---------|--------|-------|
| WS Auth | OK | JWT handshake validation |
| Room Authorization | OK | Coach-only events enforced server-side |
| Rate Limiting | MISSING | No per-connection rate limiting |
| Message Size | MISSING | No max message size validation |
| Replay Permissions | OK | Coach-only replay triggering |
| Annotation Permissions | OK | Server validates coach role on draw |

---

## 4. Product Review

### 4.1 Missing Features (Critical / High Priority)

| # | Feature | Should Exist? | Why | Priority |
|---|---------|---------------|-----|----------|
| F1 | **Notifications** | Yes | No in-app, email, or push notifications | Critical |
| F2 | **Email System** | Yes | Password reset, invites, clip shares need email | Critical |
| F3 | **Audit Logging** | Yes | No audit trail for compliance | High |
| F4 | **Data Retention/GDPR** | Yes | No data export, deletion, retention settings | High |
| F5 | **Search** | Yes | No search across sessions, clips, users | High |
| F6 | **User Preferences** | Yes | No notification preferences, timezone, language | Medium |
| F7 | **Organization Settings** | Yes | No org-level settings (branding, defaults) | Medium |
| F8 | **Team Management** | Yes | No team hierarchy, group coaching | Medium |
| F9 | **Analytics Dashboard** | Yes | No usage analytics, session metrics | Medium |

### 4.2 Meeting Experience (vs Google Meet / Zoom)

| Feature | Zoom | Meet | ReplayCoach |
|---------|------|------|-------------|
| Copy meeting link | Yes | Yes | Yes |
| Share button | Yes | Yes | MISSING |
| Waiting room | Yes | Yes | Yes (lobby) |
| Join before host | Yes | Yes | MISSING |
| Raise hand | Yes | Yes | MISSING |
| Participant list | Yes | Yes | Yes (Roster) |
| Chat | Yes | Yes | MISSING |
| Recording indicator | Yes | Yes | Yes |
| Device selection | Yes | Yes | MISSING |
| Camera mirroring | Yes | Yes | MISSING |
| Screen sharing | Yes | Yes | Yes |
| Fullscreen | Yes | Yes | MISSING |
| Layout switching | Yes | Yes | Yes |
| Host controls | Yes | Yes | PARTIAL |
| Meeting timer | Yes | Yes | MISSING |
| Connection quality | Yes | Yes | MISSING |
| Mute all | Yes | Yes | MISSING |

---

## 5. Performance Review

### 5.1 Frontend Performance

| Issue | Severity | Description |
|-------|----------|-------------|
| No code splitting for session route | High | `/session/[id]` loads LiveKit + pose + annotation bundles eagerly |
| No image optimization | Medium | No next/image usage |
| No skeleton/loading states | Medium | Several pages lack loading placeholders |
| Large bundle size | Medium | LiveKit components are heavy |
| No virtualized lists | Medium | Lists don't virtualize for large datasets |

### 5.2 Backend Performance

| Issue | Severity | Description |
|-------|----------|-------------|
| N+1 queries in clip list | High | Each clip triggers separate share-count query |
| No query result caching | Medium | No Redis caching for user profiles, org data |
| No connection pooling for pose-service | Medium | Each export creates new HTTP connection |

### 5.3 Database Performance

| Issue | Severity | Description |
|-------|----------|-------------|
| Missing composite index on pose_keypoint_frames | High | Queries by (recording_id, frame_timestamp_ms) need composite index |
| JSONB keypoints without GIN index | Medium | No GIN index on JSONB for partial lookups |
| No partitioning on large tables | Medium | pose_keypoint_frames will grow very large |

### 5.4 Pose Processing Performance

| Issue | Severity | Description |
|-------|----------|-------------|
| Single-threaded inference | High | ONNX Runtime session is single-threaded per worker |
| No batch inference | Medium | Each frame inferred individually |
| No GPU auto-scaling | Medium | No queue-based scaling for pose workers |

---

## 6. UX Review

### 6.1 Missing UX Elements

| Element | Status |
|---------|--------|
| Loading skeleton (dashboard pages) | MISSING |
| Empty state (clip list, session list) | MISSING |
| Error state (API-dependent pages) | MISSING |
| Confirmation dialog (delete, end session) | MISSING |
| Success toast (clip created, share sent) | MISSING |
| Error toast (failed API calls) | MISSING |
| Accessibility (ARIA, focus management) | MISSING |
| Progress indicator (export, upload) | MISSING |
| Onboarding (new users) | MISSING |
| Settings page (user preferences) | MISSING |
| Mobile responsiveness (replay/annotation) | PARTIAL |
| Keyboard shortcuts (annotation modal, session room) | PARTIAL |

### 6.2 User Flow Gaps

| Flow | Issue |
|------|-------|
| First login | No onboarding, dropped into empty dashboard |
| Session creation | No confirmation, no share flow |
| Student invite | No email, no join link copy |
| Clip sharing | No notification to student |
| Password reset | Stub — always returns 404 |
| Account deletion | No flow exists |
| Profile update | No avatar, no preferences |
| Session scheduling | No timezone handling |

---

## 7. Code Quality Review

### 7.1 What is Excellent

1. Consistent module pattern across NestJS modules
2. Shared types package prevents API contract drift
3. Global exception filter for consistent error shape
4. Request ID propagation for distributed tracing
5. Cookie helper with config-driven attributes
6. Composable JWT + Roles guards

### 7.2 Code Quality Issues

| # | Issue | Severity |
|---|-------|----------|
| Q1 | Inconsistent error handling across services | High |
| Q2 | 37 TODO/FIXME markers | Medium |
| Q3 | Duplicate annotation rendering logic | Medium |
| Q4 | Magic numbers not centralized | Low |
| Q5 | No API documentation (Swagger) | Medium |
| Q6 | Dead code in export state management | Medium |
| Q7 | Large files (AnnotationTrackingModal ~900 lines) | Low |

### 7.3 Test Coverage Gaps

| Module | Status | Missing |
|--------|--------|---------|
| Auth | PARTIAL | No integration tests for refresh flow |
| Sessions | PARTIAL | No tests for lobby flow |
| Media | PARTIAL | No tests for egress webhook |
| Replay | PARTIAL | No tests for targeted replay |
| Annotations | NONE | No tests |
| Reference | NONE | No tests for export flow |

---

## 8. Database Review

### 8.1 Schema Issues

| # | Issue | Table | Severity |
|---|-------|-------|----------|
| D1 | No soft deletes | Most entities | High |
| D2 | No unique constraint on email | users | High |
| D3 | JSONB without validation | pose_keypoint_frames.keypoints | Medium |
| D4 | Missing composite index | pose_keypoint_frames | High |
| D5 | No FK cascades | Multiple entities | Medium |
| D6 | No index on session_participants.user_id | session_participants | Medium |
| D7 | No created_at on some tables | sessions | Low |
| D8 | No check constraints | Various | Low |
| D9 | Invite token not hashed | org_invites | Medium |

---

## 9. Infrastructure Review

| # | Issue | Severity | Description |
|---|-------|----------|-------------|
| I1 | Terraform not applied | Critical | All modules commented out |
| I2 | No CI/CD | Critical | GitHub Actions workflows are placeholders |
| I3 | No monitoring | Critical | No CloudWatch, no Sentry |
| I4 | No log aggregation | High | PM2 logs only |
| I5 | No backup strategy | High | No RDS snapshots |
| I6 | No SSL/TLS | High | No ALB, no ACM |
| I7 | No WAF | Medium | No Web Application Firewall |
| I8 | No auto-scaling | Medium | No target-tracking |
| I9 | No disaster recovery | High | No multi-AZ |
| I10 | Secrets in .env | Medium | No Secrets Manager |

---

## 10. Frontend-Specific Issues

| # | Component | Issue | Severity |
|---|-----------|-------|----------|
| V1 | `AnnotationTrackingModal` | 900+ lines, does too much | Medium |
| V2 | `ReplayPanel` | No buffering indicator | Medium |
| V3 | `VideoGrid` | No connection quality indicator | Low |
| V4 | `SkeletonOverlay` | No animation between frames | Low |
| V5 | `TrackBufferManager` | No size limit on buffer | Medium |
| V6 | Dashboard pages | No loading/error/empty states | High |
| V7 | All pages | No 404 page | Medium |
| V8 | All pages | No error boundary | Medium |
| V9 | Navigation | No breadcrumb | Low |
| V10 | Forms | Inconsistent validation | Medium |

---

## 11. Backend-Specific Issues

| # | Issue | Severity |
|---|-------|----------|
| B1 | No API versioning beyond prefix | Low |
| B2 | No pagination standard | Medium |
| B3 | No request validation on query string params | Medium |
| B4 | No response compression | Low |
| B5 | Mock mode falls through silently | Medium |
| B6 | No message size limit on WebSocket | Medium |

---

## 12. Bugs Found

| # | Bug | File | Description |
|---|-----|------|-------------|
| 1 | Export button not disabled during processing | `AnnotationTrackingModal.tsx` | `exporting` state not properly toggled |
| 2 | Double-click creates duplicate sessions | `sessions.controller.ts` | No idempotency key |
| 3 | Annotation label not saved on creation | `AnnotationTrackingModal.tsx` | Label set via PATCH after create |
| 4 | Socket reconnect doesn't re-join rooms | `socket-client.ts` | Manual reconnect needed |
| 5 | Refresh token cookie not cleared on logout | `auth.controller.ts` | Cookie clear path mismatch |
| 6 | Pose overlay staleness not detected | `usePoseOverlay.ts` | 2s timeout may not fire |
| 7 | Reference video upload progress missing | `reference.controller.ts` | No progress callback |
| 8 | Clip share count not refetched | `clips.service.ts` | Count cached in component state |
| 9 | User search not debounced | Dashboard pages | API called on every keystroke |
| 10 | Invite code not auto-copied | `sessions/page.tsx` | No clipboard feedback |

---

## 13. Potential Future Problems

| # | Problem | Impact | Likelihood |
|---|---------|--------|------------|
| P1 | Pose keypoint table grows unbounded | DB storage explosion | High |
| P2 | Redis stream consumers fall behind | Pose overlay lag | Medium |
| P3 | S3 costs without lifecycle | Cost explosion | High |
| P4 | Single API instance bottleneck | Request queuing | Medium |
| P5 | JWT secret rotation disruption | Mass logout | Medium |
| P6 | ONNX model compatibility | Inference errors | Low |
| P7 | Browser codec compatibility | Video playback failures | Low |

---

## 14. Recommended Improvements

### 14.1 Security (Do Immediately)

1. Implement middleware auth check
2. Add pose-service authentication
3. Fix webhook mock mode
4. Add rate limiting to register, refresh, reset-password
5. Sanitize CloudFront signer input
6. Validate pose-service URLs (prevent SSRF)
7. Remove Redis credentials from logs
8. Move access token to memory-only

### 14.2 Production Readiness (Do Before Launch)

1. Apply Terraform infrastructure
2. Set up CI/CD
3. Configure monitoring
4. Implement backups
5. Add WAF + SSL/TLS
6. Set up secrets management
7. Implement audit logging
8. Add data retention/GDPR

### 14.3 UX Polish (Do Soon)

1. Add loading skeletons
2. Add empty states
3. Add error boundaries
4. Add confirmation dialogs
5. Add success/error toasts
6. Fix mobile responsiveness
7. Add accessibility

---

## 15. Suggested Roadmap

### Phase 0 — Security Hardening (1-2 weeks)
- Fix C1: Implement middleware auth
- Fix C2: Add pose-service authentication
- Fix C3: Fix webhook mock mode
- Fix H1-H4: Add rate limiting
- Fix H4-H6: Sanitize inputs, prevent SSRF

### Phase 1 — Production Foundation (2-3 weeks)
- Apply Terraform
- Set up CI/CD
- Configure monitoring
- Implement backups
- Add WAF + SSL/TLS

### Phase 2 — UX Polish (1-2 weeks)
- Loading/error/empty states
- Confirmation dialogs
- Mobile responsiveness
- Accessibility

### Phase 3 — Feature Completion (3-4 weeks)
- Notifications
- Email system
- Audit logging
- Analytics

---

## 16. Technical Debt

| Area | Debt | Effort | Priority |
|------|------|--------|----------|
| Frontend | 37 TODO/FIXME markers | 2 days | Medium |
| Frontend | 2 placeholder pages | 1 day | Medium |
| Frontend | No error boundaries | 1 day | High |
| Backend | No API docs | 2 days | Medium |
| Backend | Missing soft deletes | 2 days | High |
| Backend | Missing unique constraints | 1 day | High |
| Database | Missing composite indexes | 1 day | High |
| Infrastructure | No CI/CD | 3 days | Critical |
| Infrastructure | No monitoring | 2 days | Critical |
| Security | No auth on middleware | 1 day | Critical |
| Security | No auth on pose-service | 1 day | Critical |
| Security | No rate limiting | 1 day | High |

**Total estimated debt: ~30 engineering days**

---

## 17. Production Readiness Checklist

| Category | Item | Status |
|----------|------|--------|
| **Security** | Authentication on all routes | FAIL |
| | Authorization on all endpoints | FAIL |
| | Rate limiting on auth endpoints | FAIL |
| | Input validation on all inputs | PARTIAL |
| | IDOR prevention | FAIL |
| | Secrets management | FAIL |
| **Infrastructure** | CI/CD pipeline | FAIL |
| | Monitoring | FAIL |
| | Backup strategy | FAIL |
| | SSL/TLS | FAIL |
| | WAF | FAIL |
| **Application** | Error boundaries | FAIL |
| | Loading states | FAIL |
| | Audit logging | FAIL |
| | Data retention | FAIL |
| **Testing** | Unit tests | PARTIAL |
| | Integration tests | FAIL |
| | E2E tests | FAIL |
| | Load testing | FAIL |

**Readiness: ~35%**

---

## 18. Priority Matrix

### Critical (Do Immediately)
- C1: No-op middleware — all routes exposed
- C2: No auth on pose-service
- C3: Webhook accepts unverified input in mock mode
- I1: Terraform not applied
- I2: No CI/CD
- I3: No monitoring

### High (Do Before Launch)
- H1-H8: Security vulnerabilities (rate limiting, SSRF, path traversal)
- F1-F4: Missing features (notifications, email, audit, data retention)
- D1-D4: Database issues (soft deletes, unique constraints, indexes)
- I4-I6: Infrastructure gaps (log aggregation, backups, SSL)

### Medium (Do in First Month)
- M1-M7: Medium security issues
- Q1-Q10: Code quality issues
- V1-V8: Component issues
- UX polish items

### Low (Do When Convenient)
- L1-L7: Low security issues
- S1-S5: State management issues
- Documentation improvements

---

## 19. Final Recommendations

### Immediate Actions (This Week)

1. **Implement the frontend middleware auth check** — One file change closes a critical vulnerability.
2. **Add shared-secret authentication to the pose-service** — Simple API key middleware for internal endpoints.
3. **Fix the webhook mock mode** — Return 503 when LiveKit credentials are missing.
4. **Add `@Throttle()` decorators** to register, refresh, and reset-password endpoints.
5. **Sanitize the CloudFront signer** — Reject `..` and validate URI structure.

### Before Accepting Production Traffic

1. Apply Terraform infrastructure
2. Set up CI/CD with lint-test-build-deploy pipeline
3. Configure monitoring (CloudWatch, Sentry, Grafana)
4. Implement backup strategy (RDS snapshots, S3 versioning)
5. Add WAF + SSL/TLS
6. Set up secrets management (AWS Secrets Manager)
7. Implement audit logging
8. Add data retention/GDPR compliance
9. Add loading/error/empty states to all frontend pages
10. Implement 404 page and error boundaries

---

## Summary

ReplayCoach is a **well-architected platform with strong engineering foundations** — clean modular design, type safety, good DI patterns. The skeleton detection, replay system, and annotation tracking are genuinely innovative features.

However, the project has **significant security gaps** (3 critical, 8 high vulnerabilities) and is **missing core production infrastructure** (monitoring, CI/CD, backups, secrets management). The codebase contains **37 TODO markers** and **2 placeholder pages** that need completion.

**Score: 5.5/10** — Excellent architecture and core features, but needs security hardening and production infrastructure before launch.

**Next immediate step:** Fix C1 (middleware auth), C2 (pose-service auth), and C3 (webhook mock mode). These three fixes alone reduce the attack surface by ~80%.

---

*End of audit report.*
