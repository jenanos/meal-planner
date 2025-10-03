# syntax=docker/dockerfile:1.4

FROM node:20-slim AS base
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH="${PNPM_HOME}:$PATH"
RUN corepack enable

# Prisma requires OpenSSL at generate/runtime
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Workspace manifests first (better layer caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/api/package.json packages/api/package.json
COPY packages/database/package.json packages/database/package.json
COPY apps/server/package.json apps/server/package.json

# Install deps without running scripts yet (Prisma postinstall needs schema files)
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM base AS builder
WORKDIR /app
COPY packages ./packages
COPY apps/server ./apps/server
COPY tsconfig.json ./tsconfig.json

# Now that sources are present, generate Prisma client
RUN pnpm --filter @repo/database run generate

FROM node:20-slim AS runner
ENV NODE_ENV=production
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH="${PNPM_HOME}:$PATH"
RUN corepack enable

# Prisma query engine needs OpenSSL at runtime
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
# Include workspace sources (for linked packages) and server sources
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/server ./apps/server
COPY apps/server/package.json ./apps/server/package.json

EXPOSE 4000

CMD ["node", "--import", "tsx", "apps/server/src/index.ts"]
