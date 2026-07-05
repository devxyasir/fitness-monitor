# 16 — Security Guidelines (Cross-Cutting)

This document consolidates security requirements referenced throughout the other modules into one checklist-style reference.

## 1. Authentication & Session Security
- Argon2id/bcrypt password hashing (`06`), short-lived JWT access tokens in memory only, httpOnly refresh cookies with rotation + reuse detection.
- `sessionVersion` claim for instant token invalidation on password change/forced logout.
- Optional TOTP 2FA for coach/admin roles.

## 2. Authorization
- RBAC + resource-level ownership/membership checks on every request (`06` §4) — never role-only checks for session/recording/clip access.
- Coach-only actions (replay trigger/targeting, annotation drawing, participant removal) enforced server-side on both REST and WebSocket surfaces, never trusted from client UI state alone.

## 3. API Security
- Rate limiting per endpoint class (`12` §7), Redis-backed, IP + account-based.
- Strict DTO validation, allow-listed fields (no mass assignment).
- CORS restricted to known frontend origins only.
- Security headers: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy` restricting script/media sources.

## 4. Injection Prevention
- **SQL Injection:** All DB access via parameterized queries/ORM (TypeORM or Prisma) — no raw string-concatenated SQL anywhere.
- **XSS:** React's default escaping relied on everywhere; annotation text rendered via canvas/SVG text nodes, never `dangerouslySetInnerHTML`; CSP as defense-in-depth.
- **CSRF:** SameSite=Strict on the refresh-token cookie; state-changing REST endpoints require the Bearer access token (not cookie-only auth), which itself is immune to classic CSRF since it's not automatically attached by the browser.

## 5. Secrets Management
- AWS Secrets Manager for all credentials (DB, LiveKit API keys/secrets, KMS config) — injected at runtime via ECS task definitions, never committed to git or baked into container images.
- Secret rotation policy for DB credentials and LiveKit keys (automated rotation where supported).

## 6. AWS-Specific Security
- IAM least privilege per service (`15` §6), no shared god-roles.
- S3 Block Public Access on all buckets except explicitly public user-assets (`14` §7).
- VPC network segmentation: public subnets for ALB/NAT only, everything else private.
- WAF + GuardDuty active in production (`15` §8).

## 7. Encryption
- TLS 1.2+ everywhere in transit (including internal service-to-service where feasible).
- WebRTC media encrypted via DTLS-SRTP (LiveKit default).
- At-rest encryption: RDS encryption enabled, S3 SSE-KMS with customer-managed keys.

## 8. Replay & Meeting Access Control (product-specific, high priority)

This is the most novel security surface in this product and deserves explicit emphasis:

- **Session join control:** LiveKit tokens minted only after server-side verification of session participation; single-room-scoped, short TTL (`06` §5, `07` §7).
- **Replay authorization:** Every seek/target request checked against session participation and role (coach-only for triggering/targeting) — see `08` §7.
- **Per-student data isolation:** A student can only ever be granted signed access to *their own* recording/pose data, verified server-side against `recordings.participant_id`, never trusting a client-supplied identifier (`08` §7, `09` §8).
- **Signed URL discipline:** All recording/clip access via short-TTL CloudFront signed URLs — never long-lived or publicly guessable links (`14` §4).
- **Annotation authorization:** Draw/undo/clear restricted server-side to the coach role for the active session (`10` §7).

## 9. Logging & Audit Trails
- Structured audit log (`audit_logs` table, `05` §2) for: login/logout, session create/join/end, recording access/download, clip sharing, admin actions, permission-denied events.
- Audit logs are append-only from the application's perspective (no update/delete endpoint); retention independent of the resources they reference (`05` §5).
- No sensitive data (passwords, raw tokens, full recording contents) ever written to logs — structured logging with explicit field allow-listing (`17`).

## 10. Error Handling
- Generic error messages to clients; full detail only in server-side structured logs correlated by `requestId` (`12` §5).
- No stack traces, DB error text, or internal paths exposed in API responses.

## 11. Secure WebSockets
- Handshake-time JWT validation, server-derived channel membership only (`11` §5).
- Per-connection rate limiting on inbound events (`11` §7).

## 12. Data Privacy (Biometric-Adjacent Data)
- Pose/skeleton keypoint data treated as sensitive by default (Assumption A5) — same access control tier as the underlying recording, excluded from any analytics export/aggregation pipeline without explicit separate review.
- Account deletion cascades to recordings and pose data per `05` §5, balanced against audit-log integrity requirements.

## 13. Security Review Checklist (Pre-Launch)

- [ ] Penetration test / third-party security review completed on auth, session-join, and replay-authorization flows specifically (highest-value attack surface in this product).
- [ ] IDOR testing performed against every session/recording/clip-scoped endpoint.
- [ ] Dependency vulnerability scanning (e.g., `npm audit`, `pip-audit`, Dependabot) integrated into CI (`19`).
- [ ] Secrets scanning integrated into CI (prevent accidental credential commits).
- [ ] WAF rules validated against common attack payloads in staging.
- [ ] Data retention/deletion flows tested end-to-end (account deletion actually removes recordings within the documented SLA).
