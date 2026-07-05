# 20 — Performance Optimization

## 1. Latency Budget Breakdown (Replay Seek, target <3s — NFR §1, FR-4.4)

| Stage | Budget | Optimization lever |
|---|---|---|
| API authorization + request handling | <100ms | Keep policy checks indexed/cached, avoid N+1 DB queries |
| Segment resolution (find S3 segment for timestamp) | <200ms | Store segment manifest metadata in Postgres/Redis, not a live S3 `ListObjects` call |
| Signed URL generation | <100ms | CloudFront signing is cheap/local, no external call needed |
| Client manifest fetch + player buffer | <1.5s | Short (2-6s) HLS segments minimize initial buffering; CDN edge caching for already-finalized parts of the manifest |
| Player seek + first-frame render | <1s | `hls.js` low-latency mode tuning |

Tune segment length (`08_Recording_Replay_DVR_System.md` §8) as the primary lever if real-world measurements exceed budget — shorter segments improve seek granularity at the cost of more Egress/S3 overhead.

## 2. Live Video & Pose Overlay

- Simulcast (LiveKit default) ensures each subscriber gets an appropriately sized stream for their bandwidth/viewport — avoids wasting bandwidth on a full-res stream for a small gallery tile.
- Pose sampling at 8-10Hz (not 30fps) balances perceived smoothness against inference cost/latency (`09` §4).
- Skeleton overlay rendered on a separate canvas layer positioned via CSS transform over the video element — avoids re-encoding/mixing video and overlay server-side, which would add latency.

## 3. Database

- Read replica for all session-history/reporting/dashboard queries, isolating them from the live-session write path (`03` §6).
- Composite indexes tuned for the exact query patterns in `05_Database_Design.md` §3 — validated with `EXPLAIN ANALYZE` under realistic data volume before launch, not just at small dev-scale.
- Connection pooling (PgBouncer or RDS Proxy) to handle bursty connection patterns from auto-scaled ECS tasks without exhausting Postgres's max connections.

## 4. WebSocket Fanout

- Compact binary-ish payloads (short field names, arrays over named objects) for high-frequency pose events to reduce bandwidth at scale (NFR §2 concurrent sessions × participants).
- Redis adapter co-located in-region with gateway pods (`11` §8) to minimize fanout latency.

## 5. Frontend

- Code-splitting for the heavy `session/[id]` bundle (LiveKit SDK + hls.js) away from marketing/dashboard routes (`13` §6).
- Canvas-based rendering (not React re-renders) for annotation drawing and skeleton overlay (`13` §6, `10` §8).
- Next.js image optimization and SSR for dashboard/marketing pages to hit the <2.5s TTI target (NFR §1).

## 6. Caching Strategy

| Data | Cache | TTL/invalidation |
|---|---|---|
| User profile/session metadata | Redis | Invalidate on write |
| Segment manifest metadata | Redis | Updated on each Egress webhook |
| Finalized recordings/clips | CloudFront edge cache | Long TTL (immutable once finalized) |
| Rate-limit counters | Redis | Sliding window |

## 7. Load Testing Plan

- Simulate NFR §2 launch target (100 concurrent sessions, up to 12 participants each) with synthetic LiveKit clients + synthetic pose-inference load, verifying all latency SLOs in NFR §1 hold under load, not just in isolation.
- Specifically load-test the replay-seek path under concurrent load (many coaches seeking simultaneously) since this is the product's most latency-sensitive, most differentiated feature.

## 8. Common Pitfalls

- ❌ Optimizing average-case latency while ignoring p95/p99 — coaching UX degrades sharply if even 5% of seeks take >5s.
- ❌ Running load tests only against isolated services rather than the full path (API → S3 → CDN → client player) that actually determines user-perceived replay latency.

## 9. Acceptance Criteria

- [ ] Replay seek p95 latency <3s under the NFR §2 launch-scale load test.
- [ ] Pose overlay lag <200ms measured end-to-end (not just inference time) under realistic concurrent-session load.
- [ ] Dashboard/marketing pages meet <2.5s TTI on throttled 4G in Lighthouse CI.
- [ ] No N+1 query patterns present in session-history or replay-resolution endpoints (verified via query logging in staging).
