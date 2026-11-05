#!/usr/bin/env bash
set -euo pipefail

# Ensure DATABASE_URL is set
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set" >&2
  exit 1
fi

# Move into database package for prisma CLI context
cd /app/packages/database

# Call the locally installed binaries directly instead of `npx`/`pnpm`:
# npx can fall back to downloading from the registry, and pnpm (via corepack)
# would be downloaded at every container start. The container runs as a
# non-root user with a read-only node_modules, so nothing may be fetched here.
PRISMA=./node_modules/.bin/prisma
TSX=./node_modules/.bin/tsx

# Apply migrations depending on env
if [[ "${NODE_ENV:-production}" == "production" ]]; then
  echo "Running prisma migrate deploy..."
  "$PRISMA" migrate deploy
else
  echo "Running prisma migrate dev..."
  "$PRISMA" migrate dev --name "auto_migrate_on_start" --skip-generate --create-only || true
  "$PRISMA" migrate dev --skip-generate
fi

# Optionally seed
if [[ "${SEED_ON_START:-false}" == "true" ]]; then
  echo "Seeding database..."
  "$TSX" src/seed.ts
fi

# Go back and start the server
cd /app
exec node --import tsx apps/server/src/index.ts
