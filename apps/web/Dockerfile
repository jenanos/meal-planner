# syntax=docker/dockerfile:1.4

FROM node:20-slim AS base
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH="${PNPM_HOME}:$PATH"
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/api/package.json packages/api/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app

COPY packages ./packages
COPY apps ./apps
COPY tsconfig.json ./tsconfig.json

ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter web... build
RUN pnpm prune --prod

FROM node:20-slim AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH="${PNPM_HOME}:$PATH"
RUN corepack enable

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY apps/web/package.json ./apps/web/package.json
COPY apps/web/next.config.js ./apps/web/next.config.js
COPY apps/web/postcss.config.mjs ./apps/web/postcss.config.mjs
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public

WORKDIR /app/apps/web

EXPOSE 3000

CMD ["pnpm", "start"]
