#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DUMP_PATH="$ROOT_DIR/dev-data/prod-dumps/20260314-meals-db-plain-backup"

if [[ ! -f "$DUMP_PATH" ]]; then
  echo "Fant ikke dumpfilen: $DUMP_PATH" >&2
  exit 1
fi

cd "$ROOT_DIR"

echo "==> Restarting Docker services (wiping volumes)..."
docker compose down -v
docker compose up -d --wait

echo "==> Installing dependencies..."
pnpm install

echo "==> Generating Prisma client..."
pnpm --filter @repo/database generate

echo "==> Running migrations..."
pnpm --filter @repo/database db:migrate:deploy

echo "==> Seeding database from repo-local prod dump..."
PROD_DB_DUMP_PATH="$DUMP_PATH" pnpm db:seed

echo "==> Done! Run 'pnpm dev' to start."
