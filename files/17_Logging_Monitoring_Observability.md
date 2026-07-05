# 17 — Logging, Monitoring & Observability

## 1. Logging Strategy

- Structured JSON logs (not free-text) from every service — Core API, WebSocket Gateway, Pose Service, Egress orchestration.
- Every log line includes: `timestamp`, `service`, `level`, `requestId`/`correlationId`, `userId` (if authenticated), `sessionId` (if applicable).
- Log levels: `debug` (dev only), `info` (normal operation events), `warn` (degraded but recovered — e.g., pose service timeout), `error` (failed operation), `fatal` (service crash).
- Shipped to CloudWatch Logs, with a defined retention period (e.g., 30 days hot, exported to S3 for longer-term compliance retention if needed).

## 2. What Gets Logged (Beyond Audit Trail)

| Event | Level | Notes |
|---|---|---|
| Session created/joined/ended | info | Correlates with `audit_logs` DB entries |
| LiveKit room create/destroy | info | |
| Egress start/stop/failure | info/error | Critical for detecting silent recording failures |
| Pose service timeout/circuit-breaker trip | warn | Should never be `error` on its own — by design, it's a non-fatal degradation |
| Replay seek request + resolution time | info | Feeds directly into the latency SLO tracking (NFR §1) |
| Auth failures (rate-limited, invalid credentials) | warn | Security-relevant, feeds alerting |
| Unhandled exceptions | error | Paired with Sentry capture |

## 3. Metrics & Dashboards

| Dashboard | Key metrics |
|---|---|
| **System health** | API p50/p95/p99 latency, error rate, ECS task health, DB connection pool saturation |
| **Media/Live sessions** | Active sessions, active participants, LiveKit SFU CPU/bandwidth, glass-to-glass latency samples |
| **Recording pipeline** | Egress success/failure rate, segment write latency, S3 finalization job duration |
| **Pose service** | Inference queue depth, per-worker throughput, GPU utilization, overlay latency (live vs. target 200ms) |
| **Replay** | Seek request latency distribution (target <3s), replay-target broadcast latency |
| **Business** | Sessions/day, active coaches/students, clips created/shared |

- Prometheus + Grafana (self-hosted or Amazon Managed Prometheus/Grafana) for custom application/media metrics; CloudWatch for AWS-native infra metrics — unified in Grafana dashboards where possible.

## 4. Distributed Tracing

- OpenTelemetry instrumentation across Core API, WebSocket Gateway, and Pose Service, correlated by `requestId`/`sessionId`, so a slow replay-seek request can be traced end-to-end (API → S3 lookup → response) even though it spans multiple services.

## 5. Alerting

| Condition | Severity | Channel |
|---|---|---|
| API error rate > 2% over 5 min | High | PagerDuty/Slack |
| Egress failure rate > 5% over 10 min | High | PagerDuty/Slack — direct impact on the core replay feature |
| Pose inference queue depth sustained high (backlog growing) | Medium | Slack |
| Replay seek p95 latency > 3s (breaching NFR) | Medium | Slack |
| RDS CPU/connection saturation | High | PagerDuty |
| WAF blocking spike (possible attack) | Medium | Slack (security channel) |
| Auth failure spike from single IP/account | Medium | Security alert |

## 6. Error Tracking

- **Sentry** for both frontend and backend, with release/version tagging so regressions can be tied to specific deploys.
- Source maps uploaded on frontend deploy for readable stack traces without exposing them to end users.

## 7. Security Considerations

- Logs never contain: passwords, raw JWT/refresh tokens, full recording byte content, or unmasked payment details.
- Access to production logs/dashboards restricted via IAM/SSO roles, itself audit-logged.

## 8. Common Pitfalls

- ❌ Logging pose service warnings at `error` level, causing alert fatigue for a scenario that's designed to be non-fatal.
- ❌ Free-text logs without correlation IDs — makes cross-service debugging of a single replay request nearly impossible.
- ❌ Not distinguishing "recording pipeline degraded" (business-critical) from generic infra noise in alert routing.

## 9. Acceptance Criteria

- [ ] Every request traceable end-to-end via a single correlation ID across API, WebSocket, and Pose service logs.
- [ ] Dashboards exist and are populated for all five categories in §3 before launch.
- [ ] Alert thresholds in §5 configured and tested (fire a synthetic failure, confirm alert delivery) before go-live.
- [ ] No sensitive data found in a log audit sample prior to launch.
