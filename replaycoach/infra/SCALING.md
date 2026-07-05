# Scaling notes (FIX_07)

Operational notes for running more than one instance of the API and/or pose-service.
These are infra/config decisions, not application code.

## Load balancer: sticky sessions

The Socket.IO client now allows `polling` as a transport fallback (FIX_02). Plain
WebSocket connections don't need stickiness, but HTTP long-polling does — the client's
polling requests must land on the **same** API node each time, or the handshake breaks.

Cross-instance broadcast (so a socket on node A still receives events published from
node B) is handled separately by the Redis Socket.IO adapter
(`apps/api/src/realtime/redis-io.adapter.ts`) — stickiness is only about the handshake,
not about fan-out.

**Choose one:**
- Configure the load balancer for sticky sessions (cookie-based or IP-hash), so a
  client's polling requests consistently reach the same instance. Recommended default.
- Or, if your ingress reliably supports WebSocket upgrades end-to-end, keep
  websocket-first and treat polling as a same-node fallback only (no stickiness
  required, but a client stuck on polling behind a bad proxy may fail to connect).

## Postgres connection pool

`apps/api/.env`'s `DATABASE_URL` currently points at the Supabase **session pooler**
(port `5432`). For many short-lived queries across multiple API instances, prefer the
**transaction pooler** (port `6543`) so connections are shared efficiently — verify and
switch if appropriate. Migrations should still run against a direct/session connection,
not the transaction pooler (some migration DDL doesn't work well through it).

Whatever the pool size (`extra.max` in `app.module.ts`, currently `20`), keep
`max × instance_count` under Supabase's connection limit for your plan.

## Pose-service capacity

Each pose-service replica caps at `max_workers` (`config.py`, default `8`) tracks. Add
capacity by adding replicas — the Redis command queue (`pose:commands`, consumer group
`pose-workers`) spreads start/stop commands across whatever replicas are running; a
replica at capacity requeues the command for another replica to pick up. Size
`max_workers` per box based on available CPU/GPU, and prefer a GPU execution provider
for ONNX Runtime where available — pose inference is the per-box capacity limiter, not
the command dispatch.

## LiveKit / egress capacity

Out of app scope, but must be planned for production:

- A single dev LiveKit server does not scale to many concurrent rooms. Use LiveKit
  Cloud or a clustered/distributed SFU deployment for production.
- Each recorded room consumes an egress worker — size egress capacity (worker count)
  to the expected number of concurrent recorded sessions.
