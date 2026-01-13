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
COPY packages/config-eslint/package.json packages/config-eslint/package.json
COPY packages/config-typescript/package.json packages/config-typescript/package.json
COPY apps/mcp-server/package.json apps/mcp-server/package.json

# Install deps without running scripts yet (Prisma postinstall needs schema files)
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM base AS builder
WORKDIR /app
COPY packages ./packages
COPY apps/mcp-server ./apps/mcp-server
COPY tsconfig.json ./tsconfig.json

# Now that sources are present, generate Prisma client
RUN pnpm --filter @repo/database run generate

# Build @repo/database to create TypeScript declarations
# Force rebuild by removing tsbuildinfo cache
RUN rm -f packages/database/tsconfig.tsbuildinfo && \
    pnpm --filter @repo/database run build

# Build @repo/api (depends on @repo/database)
RUN rm -f packages/api/tsconfig.tsbuildinfo && pnpm --filter @repo/api run build

# Build mcp-server
RUN pnpm --filter mcp-server run build

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
# Include workspace sources (for linked packages) and mcp-server sources
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/mcp-server ./apps/mcp-server

EXPOSE 5050

CMD ["node", "apps/mcp-server/dist/index.js"]
