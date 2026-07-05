# 02 — Non-Functional Requirements

## 1. Performance Targets

| Metric | Target | Notes |
|---|---|---|
| Live video glass-to-glass latency | < 500ms | Standard for interactive coaching (LiveKit default WebRTC path) |
| Pose overlay latency (live) | < 200ms behind live frame | Skeleton should feel "attached" to the live video, not lag noticeably |
| Replay seek latency | < 3s from seek request to frame rendered | See `08_Recording_Replay_DVR_System.md` for how chunked HLS enables this |
| Annotation broadcast latency | < 150ms | Coach draws, student sees near-instantly (WebSocket, not polling) |
| API p95 response time | < 300ms | Standard REST endpoints (non-media) |
| Web app Time-to-Interactive | < 2.5s on 4G | Next.js SSR + code splitting |

## 2. Scalability Targets

| Dimension | Target (launch) | Target (12 months) |
|---|---|---|
| Concurrent live sessions | 100 | 1,000+ |
| Participants per session | up to 12 (group class) | up to 30 |
| Registered users | 5,000 | 50,000+ |
| Pose-inference streams concurrently | 500 | 5,000+ |

> **Assumption A2 (restated):** These numbers are illustrative defaults, not client-confirmed figures. Architecture (horizontal LiveKit SFU scaling, stateless API pods, queue-based pose inference workers) supports scaling past these without redesign — see `03_System_Architecture.md` §6 Scaling Strategy.

## 3. Availability

| Component | Target | Strategy |
|---|---|---|
| API / Web app | 99.9% uptime | Multi-AZ ECS/Fargate, auto-scaling, health checks |
| LiveKit media servers | 99.9% uptime | Multi-node cluster behind LiveKit's built-in room migration |
| Recording pipeline | No data loss for completed sessions | Egress writes directly to S3 with retry; DB tracks recording status per segment |
| Database | 99.95% | Multi-AZ RDS PostgreSQL with automated failover |

## 4. Security & Compliance

- All traffic encrypted in transit (TLS 1.2+, DTLS/SRTP for WebRTC media).
- All recordings and pose data encrypted at rest (S3 SSE-KMS, RDS encryption).
- Pose/skeleton data treated as sensitive biometric-adjacent data by default (Assumption A5) — access-controlled, deletable on request, excluded from analytics exports.
- Full audit trail on: session access, recording access/download, admin actions (see `16_Security_Guidelines.md`).
- GDPR/CCPA-style data subject rights supported: export, delete account + associated recordings.

## 5. Reliability & Fault Tolerance

- Pose detection service failure must **never** take down the live video call (FR-6.4). Circuit breaker pattern between media layer and AI service.
- If the recording/Egress pipeline fails mid-session, the live call continues uninterrupted; the failure is logged and surfaced to the coach as a non-blocking warning ("Replay temporarily unavailable").
- Graceful reconnect: a participant's brief network drop (< 30s) should resume the same LiveKit room session without ending the class.

## 6. Maintainability

- Modular monorepo (see `03_System_Architecture.md` and `05_Project_Folder_Structure` within it) so AI coding agents can work on one bounded module without touching unrelated code.
- All services independently deployable (backend API, WebSocket gateway, pose-inference workers, Egress pipeline).
- Infrastructure fully defined as code (Terraform) — no manual AWS console changes in production.

## 7. Usability

- Coach UI: the transition live → replay → annotate → return-to-live must be achievable in **under 3 clicks/taps** (per original discovery conversation's emphasis on speed).
- Skeleton overlay and annotation tools must not obscure the primary subject by default (semi-transparent, toggleable).

## 8. Observability

- Every session has an end-to-end trace: join → recording segments → pose-inference jobs → replay requests → annotation events (see `17_Logging_Monitoring_Observability.md`).
- Real-time dashboards for: active sessions, SFU load, pose-inference queue depth, S3 write failures.

## 9. Cost Awareness

- Pose inference is the largest variable cost driver (GPU/CPU time per stream-second). Architecture must support **on/off toggling per session or per org tier** so cost scales with usage, not a fixed always-on GPU fleet (see `09_Pose_Detection_Service.md` §5 Cost Model).
- Recording storage costs must be controlled via lifecycle policies (hot S3 → S3 Glacier after retention window — Assumption A7).
