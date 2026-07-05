# 21 — Production Checklist

## Infrastructure
- [ ] All infra deployed via Terraform, zero manual console changes (`15` §5)
- [ ] Multi-AZ RDS with automated backups + PITR verified via a real restore test
- [ ] Auto-scaling policies tested under simulated load for API, WebSocket Gateway, Pose workers
- [ ] WAF + GuardDuty active (`15` §8)
- [ ] Secrets Manager fully populated; zero secrets in code/images/Terraform vars (`16` §5)

## Security
- [ ] Penetration test completed on auth, session-join, and replay-authorization flows (`16` §13)
- [ ] IDOR test suite passing for all session/recording/clip endpoints (`18` §2)
- [ ] Dependency + secret scanning clean in CI (`19` §7)
- [ ] S3 buckets verified non-public except user-assets (`14` §10)
- [ ] Data retention/deletion flow tested end-to-end (`16` §13)

## Media & Recording
- [ ] LiveKit room lifecycle validated under real network conditions (join, leave, reconnect) (`07` §10)
- [ ] Egress recording verified for both track and composite modes, per-participant and full-session (`08` §11)
- [ ] Simulated Egress failure confirmed non-blocking to live call (`08` §11, `18` §2)
- [ ] Replay seek latency meets <3s p95 target under launch-scale load (`20` §9)
- [ ] Targeted replay confirmed to never leak to non-targeted participants (`18` §2)

## AI / Pose Detection
- [ ] Pose overlay latency <200ms under load (`09` §12, `20` §9)
- [ ] Pose service crash confirmed non-blocking to live video/recording (`09` §12)
- [ ] Multi-person session correctly attributes keypoints per participant (`09` §12)
- [ ] Cost/scaling model validated against real GPU-hour pricing before enabling for all orgs by default (`09` §5, `15` §9)

## Application
- [ ] All acceptance criteria in modules `06`–`13` verified complete
- [ ] Annotation frame-anchoring verified across multiple screen sizes (`10` §11)
- [ ] Rate limiting verified for auth and replay endpoints (`12` §7)
- [ ] Error responses never leak internal details (`12` §5, `16` §10)

## Observability
- [ ] Dashboards live for system health, media, recording pipeline, pose service, replay, business metrics (`17` §3)
- [ ] Alert thresholds configured and fire-tested (`17` §5)
- [ ] Distributed tracing correlates a full replay request across services (`17` §4)

## CI/CD
- [ ] Independent deploy pipelines verified for all four services (`19` §2)
- [ ] Rollback tested and time-to-recovery measured (`19` §8)
- [ ] Manual approval gate active for production deploys (`19` §2)

## Compliance & Legal (flag for client sign-off — not a pure engineering item)
- [ ] Privacy policy/ToS reflects biometric-adjacent pose data handling (Assumption A5 — confirm actual target jurisdictions with client)
- [ ] Data processing agreement in place if selling to studios (org tier — Assumption A1)
- [ ] Recording consent flow confirmed compliant with two-party consent laws in target markets (some US states and other countries require explicit consent to record — this needs legal review, not just an engineering assumption)

## Business Readiness
- [ ] Support/runbook documentation for common incidents (Egress down, pose service degraded, LiveKit outage)
- [ ] On-call rotation and escalation path defined
- [ ] Billing/subscription flow confirmed if launching with paid tiers (Assumption A6 — out of this SDD's scope but a launch blocker if required for v1)
