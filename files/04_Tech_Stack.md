# 04 — Tech Stack

## 1. Summary Table

| Layer | Technology | Justification |
|---|---|---|
| Frontend | Next.js 14+ (App Router), TypeScript, Tailwind CSS | SSR for fast load, strong ecosystem, file-based routing fits multi-role dashboards (coach/student/admin) |
| UI Components | shadcn/ui + Radix primitives | Accessible, unstyled-by-default, matches Tailwind, avoids heavy component-lib lock-in |
| Frontend state | Zustand (local/UI state) + TanStack Query (server state) | See `13_Frontend_Architecture.md` — avoids Redux boilerplate while keeping server-state caching robust |
| Backend API | NestJS (Node.js, TypeScript) | Opinionated modular architecture maps directly onto the domain boundaries in `03_System_Architecture.md`; DI system keeps modules testable/isolated — ideal for AI agents building one module at a time |
| Realtime gateway | Socket.IO on NestJS (`@nestjs/websockets`) with Redis adapter | Native NestJS integration, automatic reconnection handling, room-based broadcasting maps well to per-session channels |
| Live video / SFU | **LiveKit** (self-hosted on ECS, or LiveKit Cloud) | Open-source WebRTC SFU with first-class recording (Egress), server-side track access for pose inference, and per-participant control needed for FR-5.2 targeted replay. This is the single most important stack decision — see §2. |
| Recording | LiveKit Egress (Room Composite + Track Egress) → S3 | Native to the chosen media server; supports both a composite view and per-participant track recording (needed to run pose inference per student) |
| Pose detection | **RTMPose** (primary) with YOLO-Pose as a fallback/alternative model | See §3 for full model comparison |
| AI service runtime | Python 3.11, FastAPI, ONNX Runtime / TensorRT | FastAPI for consistency with the rest of the stack's async style; ONNX/TensorRT for optimized real-time inference |
| Database | PostgreSQL 15+ (Amazon RDS) | Relational integrity for sessions/users/orgs; JSONB columns for flexible pose-keypoint storage |
| Cache / pub-sub | Redis (Amazon ElastiCache) | WebSocket horizontal scaling (adapter), rate-limiting counters, session presence |
| Object storage | Amazon S3 | Recordings, clips, avatars |
| CDN | Amazon CloudFront | Signed URLs for private recording playback, static asset delivery |
| Infra compute | AWS ECS on Fargate (API, WS gateway, Egress orchestration); EC2 GPU (g4dn/g5) or Fargate w/ CPU-optimized inference for pose workers | Fargate removes server management for stateless services; GPU instances only where genuinely needed |
| IaC | Terraform | Reproducible, reviewable infra changes; no manual console changes (NFR §6) |
| CI/CD | GitHub Actions | Native to GitHub, sufficient for this scale, easy to extend |
| Monitoring | CloudWatch + Grafana/Prometheus (self-hosted or Amazon Managed Prometheus) | CloudWatch for AWS-native metrics/logs, Prometheus/Grafana for custom app + LiveKit metrics |
| Error tracking | Sentry | Frontend + backend error capture with release tracking |

## 2. Why LiveKit Over Alternatives

| Option | Verdict |
|---|---|
| **Zoom SDK** | Rejected — no supported way to get continuous raw per-participant frames server-side for custom recording + pose inference + targeted replay. Ruled out in discovery (see `00_Project_Overview.md` §6). |
| **Twilio Video** | Viable alternative but deprecated their Programmable Video product (sunset); not a safe long-term bet for a new build. |
| **Agora** | Capable and has recording, but LiveKit is open-source (avoids full vendor lock-in — can self-host if costs grow) and has a more modern, actively developed Egress/recording pipeline purpose-built for exactly this kind of "record + replay" use case. |
| **Mediasoup (raw)** | Would require building room management, recording, and simulcast logic from scratch — much higher build cost for no benefit over LiveKit, which already wraps mediasoup-like SFU logic with a production-ready API. |
| **LiveKit** ✅ | Chosen. Open-source (self-host or Cloud), built-in Egress with room-composite and per-track recording, active development, generous free/self-host tier controls cost, and server SDKs (Node/Python) integrate cleanly with both the NestJS API and the Python pose service. |

## 3. Pose Detection Model Comparison

| Model | Accuracy | Real-time speed | Production readiness | Verdict |
|---|---|---|---|---|
| **MediaPipe Pose** | Good | Excellent (very fast, runs on CPU/edge) | Client explicitly ruled this out for production use (discovery conversation) — treated as a prototyping tool, not a licensable production-grade model for this context | ❌ Excluded per requirement |
| **OpenPose** | Good (multi-person) | Slow, heavy, largely superseded by newer architectures | Unmaintained pace of development relative to newer models | ❌ Not recommended |
| **MoveNet (Lightning/Thunder)** | Good for single-person, fast | Excellent | Great for edge/browser use, weaker for multi-person group-class scenarios (FR-2.2 requires multi-participant) | ⚠️ Backup option for lightweight/edge scenarios only |
| **YOLO-Pose (YOLOv8-Pose)** | Very good, strong multi-person detection | Fast, GPU-efficient | Actively maintained, widely deployed in production CV systems, single model handles person-detection + pose jointly | ✅ Strong candidate |
| **RTMPose** | State-of-the-art accuracy for real-time pose (from the MMPose ecosystem) | Fast, optimized for real-time deployment (designed explicitly for this), good multi-person performance via top-down pipeline | Actively maintained (OpenMMLab), designed specifically for the accuracy/speed tradeoff this product needs | ✅ **Selected as primary** |

**Decision: RTMPose as the primary model**, since group-class sessions (FR-2.2) need reliable multi-person keypoint accuracy in real time, and RTMPose is purpose-built for exactly that tradeoff. YOLO-Pose is kept as a documented fallback (simpler to deploy, slightly lower peak accuracy) in case RTMPose's licensing (Apache 2.0 — acceptable) or deployment complexity becomes a blocker during implementation — see `09_Pose_Detection_Service.md` for the full inference pipeline design and the criteria for switching.

## 4. Monorepo Tooling

- **Turborepo** to manage the Next.js frontend, NestJS backend, and shared TypeScript types/DTOs in one repository with cached builds.
- Shared `packages/types` package for DTOs used by both frontend and backend (single source of truth for API contracts, reducing drift).
