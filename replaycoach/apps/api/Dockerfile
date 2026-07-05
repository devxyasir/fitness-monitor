# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace manifests (needed for pnpm to resolve workspaces)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/types/package.json ./packages/types/
COPY apps/api/package.json ./apps/api/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY tsconfig.base.json ./
COPY packages/types/ ./packages/types/
COPY apps/api/ ./apps/api/

# Build shared types first, then API
RUN pnpm --filter @replaycoach/types build
RUN pnpm --filter @replaycoach/api build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy only the compiled output and production node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/apps/api/dist ./dist

EXPOSE 3001

CMD ["node", "dist/main"]
