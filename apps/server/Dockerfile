# syntax=docker/dockerfile:1.4

FROM node:20-slim AS base
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH="${PNPM_HOME}:$PATH"
RUN corepack enable

WORKDIR /app

# Workspace manifests first (better layer caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/api/package.json packages/api/package.json
COPY packages/database/package.json packages/database/package.json
COPY apps/server/package.json apps/server/package.json

RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY packages ./packages
COPY apps/server ./apps/server
COPY tsconfig.json ./tsconfig.json

RUN pnpm --filter server... build

# Remove dev deps to shrink runtime node_modules
RUN pnpm prune --prod

FROM node:20-slim AS runner
ENV NODE_ENV=production
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH="${PNPM_HOME}:$PATH"
RUN corepack enable

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY apps/server/package.json ./apps/server/package.json

EXPOSE 4000

CMD ["node", "apps/server/dist/apps/server/src/index.js"]
