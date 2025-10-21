# 🍽️ Meal Planner Monorepo

[![Build and Push Docker Images](https://github.com/jenanos/meal-planner/actions/workflows/build-and-push.yml/badge.svg)](https://github.com/jenanos/meal-planner/actions/workflows/build-and-push.yml)

Meal Planner is a pnpm-powered monorepo for planning dinners, managing recipes and ingredients, and preparing weekly shopping lists. It contains a Fastify+tRPC API, a Prisma/PostgreSQL data layer, and a modern Next.js frontend that can run with real data or a mocked backend for lightweight demos.

---

## ✨ Core capabilities

- 🗓️ **Weekly planner** – generate or curate a dinner plan for any week, with usage tracking so older dishes are suggested first.
- 📖 **Recipe catalog** – add recipes with meal categories, health/everyday scores, and structured ingredient lists.
- 🧂 **Ingredient manager** – maintain an ingredient inventory and see which recipes depend on each item.
- 🛒 **Shopping list** – build a checklist directly from the planned week, including custom extras that persist week-to-week.
- 🔁 **Usage insights** – automatic `lastUsed` and `usageCount` updates keep planning suggestions fresh.

---

## 🗂️ Monorepo structure

| Package | Path | Purpose |
| ------- | ---- | ------- |
| **Frontend** | `apps/web` | Next.js App Router UI with Tailwind, tRPC React Query hooks, and mock mode for standalone deploys. |
| **API server** | `apps/server` | Fastify host that mounts the tRPC router from `@repo/api` and exposes health/readiness endpoints. |
| **tRPC router** | `packages/api` | Shared types, routers (`planner`, `recipe`, `ingredient`), and Zod schemas used by both server and frontend. |
| **Database** | `packages/database` | Prisma schema, generated client, build artifacts, and seeding utilities. |
| **UI kit** | `packages/ui` | Reusable, Tailwind-based components consumed by the web app. |
| **Config** | `packages/config-*` | Centralized TypeScript and ESLint configuration for the workspace. |

Additional pages live under `apps/web/app`: planner (`/planner`), shopping list (`/shopping-list`), recipes (`/recipes`), ingredients (`/ingredients`), and a dashboard landing page (`/`).

---

## ✅ Prerequisites

- Node.js **20** or newer (see the root `package.json` engines field).
- pnpm **10+** (`npm install -g pnpm`).
- Docker (for Postgres in local development or containerized deploys).

---

## ⚙️ Environment variables

Copy the provided examples and adjust values for your setup:

```bash
cp .env.example .env
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.local.example apps/web/.env.local
cp packages/database/prisma/.env.example packages/database/prisma/.env
```

Key settings:

- `POSTGRES_*` variables configure the database container (see `docker-compose.yml`).
- `DATABASE_URL` in `apps/server/.env` points the API to Postgres.
- `MEALS_API_INTERNAL_ORIGIN` and `NEXT_PUBLIC_API_URL` control how the web app reaches the API (internal vs. browser).
- `NEXT_PUBLIC_MOCK_MODE` (in `apps/web/.env.local`) toggles the mock backend for the frontend.

---

## 🚀 Local development workflow

1. **Install dependencies**
   ```bash
   pnpm install
   ```
2. **Start Postgres** (runs on the port from `.env`)
   ```bash
   POSTGRES_PASSWORD=<your-password> docker compose up -d postgres
   ```
3. **Apply migrations** (Prisma also regenerates the client automatically)
   ```bash
   pnpm --filter @repo/database prisma migrate dev
   ```
4. **Seed demo data (optional but recommended)**
   ```bash
   pnpm --filter @repo/database db:seed
   ```
5. **Start the API server** – runs Fastify on port `4000` by default and wires up the tRPC router.
   ```bash
   pnpm --filter server dev
   ```
6. **Start the Next.js app** in another terminal.
   ```bash
   pnpm --filter web dev
   ```
7. Visit [http://localhost:3000](http://localhost:3000) for the UI and [http://localhost:4000/ready](http://localhost:4000/ready) to verify API readiness.

> 💡 Use `pnpm dev` at the workspace root to launch both `server` and `web` via Turborepo if you prefer a single command.

---

## 🧪 Mock-only frontend mode

Run the UI without any backend or database – useful for quick demos or Vercel-style deployments:

```bash
# Development
pnpm --filter web dev:mock

# Build with mock data
NEXT_PUBLIC_MOCK_MODE=true pnpm --filter web build
```

Deployments can set `NEXT_PUBLIC_MOCK_MODE=true` to ship the static frontend backed by in-memory seed data.

---

## 🗃️ Database management

- **View data**: `pnpm --filter @repo/database studio` opens Prisma Studio.
- **Reset dev database**:
  ```bash
  pnpm --filter @repo/database prisma migrate reset -f
  pnpm --filter @repo/database db:seed
  ```
- **Force push schema (no migrations)**:
  ```bash
  pnpm --filter @repo/database prisma db push --force-reset
  pnpm --filter @repo/database db:seed
  ```

---

## 🧭 Domain highlights

- **Planner logic** (`packages/api/src/routers/planner.ts`)
  - Distributes weekly category targets (fish, vegetarian, chicken, beef, other).
  - Prioritizes recipes not used recently and balances everyday vs. weekend scores.
  - Tracks history across weeks and supports extra shopping items with persistence.
- **Recipes & ingredients** (`packages/api/src/routers/recipe.ts`, `.../ingredient.ts`)
  - Recipe CRUD with structured ingredient quantities and units.
  - Ingredient lookups reveal dependent recipes for easier pantry management.
- **Shopping list** (`apps/web/app/shopping-list/page.tsx`)
  - Aggregates recipe ingredients per week, deduplicates entries, and lets users tick off or add extras.

---

## 🧹 Quality checks

```bash
pnpm lint                    # ESLint across packages
pnpm --filter web lint       # Frontend lint only
pnpm --filter web test:e2e   # Playwright end-to-end tests (headless)
```

(Additional unit tests can live under each package; run them via `pnpm --filter <package> test` when available.)

---

## 📦 Production & Docker

- `docker-compose.prod.yml` orchestrates Postgres, the API, and the web app with health checks and internal networking.
- Build arguments ensure the frontend uses the internal proxy (`/api`) while server-side rendering calls the API service directly.
- Provide a `.env.production` file with Postgres credentials and optional `SEED_ON_START` for the API container.

For a simpler setup, you can also run `docker compose up --build` with custom override files to mimic production locally.

---

## 🆘 Troubleshooting tips

- **API not ready**: check `apps/server` logs; ensure migrations ran and Postgres is reachable.
- **Frontend requests failing**: verify `NEXT_PUBLIC_API_URL` (browser) and `MEALS_API_INTERNAL_ORIGIN` (server-side) point to the API.
- **Mock mode confusion**: remember to set `NEXT_PUBLIC_MOCK_MODE=false` when switching back to the real backend.

---

## 📄 License

The project inherits the license defined in the repository. Review `LICENSE` (if present) before distribution.
