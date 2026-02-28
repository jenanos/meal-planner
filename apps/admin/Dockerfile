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
COPY packages/config-eslint/package.json packages/config-eslint/package.json
COPY packages/config-typescript/package.json packages/config-typescript/package.json
COPY apps/admin/package.json apps/admin/package.json

# Avoid running postinstall before prisma schema is available
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM base AS builder
WORKDIR /app

COPY packages ./packages
COPY apps/admin ./apps/admin
COPY tsconfig.json ./tsconfig.json

# Generate Prisma client first
RUN pnpm --filter @repo/database run generate

# Build @repo/database to create TypeScript declarations
# Force rebuild by removing tsbuildinfo cache
RUN rm -f packages/database/tsconfig.tsbuildinfo && \
    pnpm --filter @repo/database run build

# Build @repo/api (depends on @repo/database)
RUN rm -f packages/api/tsconfig.tsbuildinfo && pnpm --filter @repo/api run build

ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ARG API_URL=http://meals-api:4000
ENV API_URL=${API_URL}
ARG MEALS_API_INTERNAL_ORIGIN=http://meals-api:4000
ENV MEALS_API_INTERNAL_ORIGIN=${MEALS_API_INTERNAL_ORIGIN}
ENV NEXT_TELEMETRY_DISABLED=1

# Build the admin app
RUN pnpm --filter admin run build
RUN pnpm prune --prod

FROM node:20-slim AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

WORKDIR /app

COPY --from=builder --chown=node:node /app/apps/admin/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/admin/.next/static ./apps/admin/.next/static
# public folder is optional; copy if it exists in future

USER node
WORKDIR /app/apps/admin

ENV PORT=3001
EXPOSE 3001

CMD ["node", "server.js"]
