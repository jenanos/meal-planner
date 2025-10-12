# syntax=docker/dockerfile:1.4

FROM node:20-slim AS base
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH="${PNPM_HOME}:$PATH"
RUN corepack enable

# Prisma (via workspace) might need OpenSSL when generating during build
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/api/package.json packages/api/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json

# Avoid running postinstall before prisma schema is available
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM base AS builder
WORKDIR /app

COPY packages ./packages
COPY apps ./apps
COPY tsconfig.json ./tsconfig.json

# Generate Prisma client first
RUN pnpm --filter @repo/database run generate

# Build @repo/database to create TypeScript declarations
# Force rebuild by removing tsbuildinfo cache
RUN rm -f packages/database/tsconfig.tsbuildinfo && \
    pnpm --filter @repo/database run build

# Build @repo/api (depends on @repo/database)
RUN pnpm --filter @repo/api run build

ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1

# Now build the web app (it will build @repo/ui as well)
RUN pnpm --filter web run build
RUN pnpm prune --prod

FROM node:20-slim AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

WORKDIR /app

## Copy Next standalone output
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
# public folder is optional; copy if it exists in future

WORKDIR /app/apps/web

EXPOSE 3000

CMD ["node", "server.js"]
