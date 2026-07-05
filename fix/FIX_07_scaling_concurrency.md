# FIX 07 — Scale to many concurrent sessions/users

**Priority:** 7 (last — build correctness first, then scale it)
**Apps touched:** `apps/api`, `apps/pose-service`, infra/config
**Depends on:** FIX_06 (DB batching) especially; benefits from 02/03.

---

## 1. Goal

The system must handle many simultaneous sessions and participants without falling over:
multiple API instances, pose workers spread across machines, sockets that broadcast across
instances, and a database/pool that copes with the load.

## 2. Current state (with evidence) — what's already good, what limits scale

**Already good (don't rebuild):**
- Socket.IO **Redis adapter** is wired (`apps/api/src/realtime/redis-io.adapter.ts`,
  `main.ts`) with an in-memory fallback — cross-instance broadcasts work.
- The pose relay uses a Redis **consumer group** (`pose-relay.service.ts`,
  `consumerName = relay-<pid>`) — multiple API instances consume the stream competitively
  without double-processing.
- The pose stream is bounded (`maxlen: 10000`) and has a per-track circuit breaker.

**Limits scale:**
1. **Pose-service is single-instance-bound.** Each process has one `WorkerPool` capped at
   `max_workers = 8` (`config.py`). There's no way to spread workers across multiple
   pose-service instances — the API would need to know which instance to call. With one
   instance you top out at 8 tracks total.
2. **DB write amplification** (fixed in FIX_06 — batching). Without it, no amount of app
   scaling helps because Postgres is the bottleneck.
3. **Socket.IO sticky sessions.** FIX_02 enabled the `polling` fallback. HTTP long-polling
   requires the client to hit the **same** node each request; behind a load balancer with
   multiple API instances and no sticky sessions, polling handshakes break. (Pure
   websocket doesn't need stickiness, but polling does.)
4. **Redis adapter reconnect is brittle.** `redis-io.adapter.ts` gives up after 3 retries
   and then permanently disables the adapter until restart — a transient Redis blip in
   prod could silently drop you to in-memory (no cross-instance broadcast).
5. **Postgres pool** unset (addressed in FIX_06).

## 3. The fix

### 3a. Make pose-service horizontally scalable (command queue, not direct HTTP)

Instead of the API calling one pose-service's HTTP endpoint (FIX_03), publish
**start/stop commands to a Redis list/stream** that any number of pose-service replicas
consume competitively. Each replica runs workers up to its own `max_workers`; add capacity
by adding replicas.

- API side: replace/augment `PoseServiceClient` to `LPUSH`/`XADD` a command
  `{ action:'start'|'stop', sessionId, participantId }` to e.g. `pose:commands`.
- Pose-service side: add a consumer loop (in `main.py` lifespan) that reads `pose:commands`
  (consumer group `pose-workers`) and calls `worker_pool.add_worker/remove_worker`. A
  replica that's at capacity NACKs/re-queues so another replica picks it up.
- Keep the direct HTTP endpoints for local/dev and debugging.

This preserves the "one worker per participant track" model while letting workers spread
across machines. (Keep FIX_03's identity contract: `participant_id` = LiveKit identity =
userId.)

Also raise/parameterize `max_workers` per instance based on the box's CPU/GPU, and run the
ONNX session with the right provider (GPU where available) — pose inference is the per-box
capacity limiter.

### 3b. Enable sticky sessions (or force websocket) at the load balancer

Because polling is now allowed (FIX_02), configure the LB for **sticky sessions**
(cookie/ip-hash) so a client's polling requests land on the same API node. Alternatively,
if your ingress reliably supports websockets end-to-end, you can keep websocket-first and
accept polling only as a same-node fallback. Document the choice in the infra README.
The Redis adapter handles cross-node *broadcast*; stickiness is only about the *handshake*.

### 3c. Harden the Redis adapter reconnect

In `redis-io.adapter.ts`, change the reconnect strategy so a transient outage doesn't
permanently disable clustering. Use capped exponential backoff that **keeps retrying**
(don't return an `Error` after 3 tries in production), and log loudly if it falls back to
in-memory so ops notice. Consider re-attempting to attach the Redis adapter on recovery.

### 3d. Stateless API instances + pool sizing

- Ensure API instances are stateless (no in-process session state beyond caches that can be
  rebuilt) so they scale horizontally behind the LB. The pose `recordingCache` from FIX_06
  should move to Redis when running multiple instances (so all instances share it).
- Set the Postgres pool (`extra.max`) per instance sensibly:
  `max × instance_count` must stay under Supabase's connection limit. Prefer the
  **transaction pooler** (port 6543) so many short queries share few backend connections.

### 3e. Capacity notes for the media layer (LiveKit)

Out of app scope but must be planned: a single dev LiveKit server won't scale. For
production use LiveKit Cloud or a clustered/distributed SFU, and size **egress** capacity
(each recorded room consumes an egress worker). Note this in infra docs; no app code change.

## 4. Files to touch

- [ ] `apps/api/src/pose/pose-service.client.ts` — publish commands to Redis (**required for scale**)
- [ ] `apps/pose-service/main.py` (+ `worker.py`) — consume `pose:commands`, capacity-aware
- [ ] `apps/api/src/realtime/redis-io.adapter.ts` — resilient reconnect (**required**)
- [ ] `apps/api/src/pose/pose.service.ts` — move recording cache to Redis for multi-instance
- [ ] Infra: LB sticky sessions; pool sizing; LiveKit/egress capacity (docs + config)

## 5. Verification

1. Run **2 API instances** behind a proxy with sticky sessions + shared Redis. Sockets from
   different clients land on different instances but still receive each other's
   `annotation:draw` / `pose:update` (cross-instance broadcast works).
2. Run **2 pose-service replicas**; start workers for more tracks than one replica's
   `max_workers` — the overflow is picked up by the second replica (check each replica's
   `GET /workers`).
3. Kill Redis briefly, bring it back — clustering recovers (adapter re-attaches; not stuck
   on in-memory).
4. Load test: N concurrent sessions with pose running; DB stays healthy (FIX_06 batching),
   no stream backlog, socket latency stays low.
5. Connection counts to Postgres stay within Supabase limits under peak.

## 6. Do NOT touch

- Don't remove the Redis adapter or consumer-group design — they're the backbone of
  horizontal scale.
- Don't make pose a hard dependency of session/video — a pose-service outage must degrade
  gracefully (skeletons stop; video/replay continue).
- Don't hold per-session state in a single API instance's memory once multi-instance.

## 7. Acceptance criteria

- Multiple API and pose-service instances run correctly behind a load balancer.
- Pose workers spread across replicas; sockets broadcast across nodes; Redis outages
  recover; Postgres connections stay within limits under load.
