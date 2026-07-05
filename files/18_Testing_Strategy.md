# 18 — Testing Strategy

## 1. Testing Pyramid

| Layer | Scope | Tooling |
|---|---|---|
| Unit tests | Individual services/functions (domain logic, policy checks, geometry math for annotations) | Jest (Node/NestJS), Pytest (Pose service) |
| Integration tests | Module-to-module within a service (e.g., `sessions` module + DB, auth guard + real JWT) | Jest + Testcontainers (real Postgres/Redis in CI) |
| Contract tests | API request/response shape consistency between frontend expectations and backend DTOs | Shared `packages/types` + Zod/class-validator schema tests |
| End-to-end tests | Full user flows through the real stack (join session, trigger replay, draw annotation) | Playwright |
| Load/performance tests | Concurrent sessions, WebSocket fanout, pose inference throughput | k6 (API/WebSocket), custom LiveKit load-test harness |
| Security tests | AuthZ/IDOR coverage, rate limiting, input validation | Jest-based policy test suite + periodic manual/pen-test pass |
| Chaos/failure-injection tests | Pose service crash, Egress failure mid-session | Manual + scripted fault injection in staging |

## 2. Critical Test Scenarios (Product-Specific)

These map directly to the acceptance criteria scattered through modules 06–12 and are called out here as the highest-priority coverage given this product's unique risk areas:

| Scenario | Why it matters |
|---|---|
| Student attempts to call `/replay/target` or emit `annotation:draw` directly | Confirms server-side role enforcement, not just UI hiding (`06` §6, `10` §7) |
| Student A requests recording/pose data for Student B's `participantId` | IDOR test — must be rejected (`08` §7, `09` §8) |
| Pose service is killed mid-session | Live video and recording must continue unaffected; skeleton overlay disappears gracefully (`09` §12) |
| Egress/S3 write fails mid-session | Live call continues; replay marked degraded, non-blocking warning shown (`08` §11) |
| Coach replays to Student A while Student B stays live | Verify B never receives `replay:start`/`annotation:draw` events (`08` §4, `11` §4) |
| Seek to an arbitrary historical timestamp mid-live-session | Verify <3s latency and correct frame/skeleton alignment (`08` §11, NFR §1) |
| Refresh token reuse (stolen token replay) | Entire token family revoked (`06` §7) |
| Group session with 6+ participants | Correct per-participant pose attribution, no cross-attribution (`09` §12) |

## 3. Test Data & Environments

- Synthetic test video streams (pre-recorded pole/dance footage or generic movement clips) used in CI/staging for pose-detection and replay tests — no real user data in lower environments.
- Staging environment mirrors prod topology at reduced scale for realistic load/chaos testing.

## 4. Coverage Targets

| Area | Target |
|---|---|
| Domain/business logic (services, guards, policies) | ≥85% line coverage |
| API controllers | ≥75%, with 100% of authorization-guard branches covered |
| Frontend critical components (ReplayPanel, AnnotationCanvas) | Component tests for all interactive states, not just rendering |
| E2E critical paths | 100% of the flows listed in §2 |

## 5. CI Gate

No merge to `main` without: passing unit + integration suite, passing lint/typecheck, passing the security-focused policy test subset, and no new critical/high vulnerabilities from dependency scanning (see `19_CI_CD_Deployment.md`).

## 6. Common Pitfalls

- ❌ Testing authorization only at the "happy path" role level, skipping cross-resource IDOR scenarios.
- ❌ Treating pose-service and Egress failure paths as untested edge cases rather than first-class scenarios — they're core to this product's reliability story (NFR §5).
- ❌ E2E tests that only check UI rendering, not that unauthorized server-side actions are actually rejected.

## 7. Acceptance Criteria

- [ ] All scenarios in §2 have automated test coverage before the corresponding module is considered "done" (ties into `23_Antigravity_Prompt_Library.md` per-module testing checklists).
- [ ] CI enforces coverage targets and blocks merges below threshold.
- [ ] Load test demonstrates the NFR §2 launch concurrency target with latency SLOs from NFR §1 still met.
