#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Dump path: CLI arg > PROD_DB_DUMP_PATH env var > error
DUMP_PATH="${1:-${PROD_DB_DUMP_PATH:-}}"

if [[ -z "$DUMP_PATH" ]]; then
  echo "Feil: Ingen dump-path angitt." >&2
  echo "Bruk: $0 <path-to-dump>" >&2
  echo "  eller sett PROD_DB_DUMP_PATH miljøvariabel." >&2
  exit 1
fi

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
