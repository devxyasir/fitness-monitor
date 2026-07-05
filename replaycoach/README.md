# ReplayCoach

Live coaching platform with full-session DVR replay, skeleton tracking, and real-time annotation.

## Stack

| Layer | Technology |
|---|---|
| Monorepo | Turborepo + pnpm workspaces |
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Backend API | NestJS (TypeScript, strict mode) |
| Realtime | Socket.IO on NestJS + Redis adapter |
| Pose detection | RTMPose (Python/FastAPI — separate service, not in this repo yet) |
| Database | PostgreSQL 15 (Amazon RDS) |
| Cache | Redis (Amazon ElastiCache) |
| Storage | Amazon S3 + CloudFront |
| IaC | Terraform (see `infra/terraform/`) |
| CI/CD | GitHub Actions |

## Prerequisites

- **Node.js ≥ 20**
- **pnpm ≥ 9** — install via `npm install -g pnpm`
- **Turborepo CLI** is installed as a devDependency (no global install needed)

## Getting Started

```bash
# 1. Install dependencies (all workspaces)
pnpm install

# 2. Copy environment files
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 3. Build all packages
pnpm turbo build

# 4. Start API in dev mode
pnpm --filter @replaycoach/api dev

# 5. Start web app in dev mode (separate terminal)
pnpm --filter @replaycoach/web dev
```

## Repository Structure

```
replaycoach/
├── apps/
│   ├── api/          # NestJS Core API
│   └── web/          # Next.js 14 frontend
├── packages/
│   └── types/        # Shared TypeScript DTOs (@replaycoach/types)
├── infra/
│   └── terraform/    # AWS infrastructure (structure only — no live resources yet)
└── .github/
    └── workflows/    # GitHub Actions CI/CD
```

## Development Commands

| Command | Description |
|---|---|
| `pnpm turbo build` | Build all apps and packages |
| `pnpm turbo lint` | Run ESLint across the monorepo |
| `pnpm turbo typecheck` | Run TypeScript type-checking |
| `pnpm turbo dev` | Start all apps in dev mode |
| `pnpm format` | Run Prettier on all files |

## Architecture

See `../files/` for the full architecture documentation:
- [03_System_Architecture.md](../files/03_System_Architecture.md)
- [04_Tech_Stack.md](../files/04_Tech_Stack.md)
- [13_Frontend_Architecture.md](../files/13_Frontend_Architecture.md)

## Contributing

This project uses **Conventional Commits**. All commit messages must follow the format:

```
<type>(optional-scope): <description>

Types: feat, fix, docs, chore, refactor, test, ci
Example: feat(api): add health-check endpoint
```

CI enforces lint + typecheck on every pull request.
