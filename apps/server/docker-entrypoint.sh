#!/usr/bin/env bash
set -euo pipefail

# Ensure DATABASE_URL is set
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set" >&2
  exit 1
fi

# Move into database package for prisma CLI context
cd /app/packages/database

# Apply migrations depending on env
if [[ "${NODE_ENV:-production}" == "production" ]]; then
  echo "Running prisma migrate deploy..."
  npx prisma migrate deploy
else
  echo "Running prisma migrate dev..."
  npx prisma migrate dev --name "auto_migrate_on_start" --skip-generate --create-only || true
  npx prisma migrate dev --skip-generate
fi

# Optionally seed
if [[ "${SEED_ON_START:-false}" == "true" ]]; then
  echo "Seeding database..."
  pnpm run db:seed --filter @repo/database
fi

# Go back and start the server
cd /app
exec node --import tsx apps/server/src/index.ts
