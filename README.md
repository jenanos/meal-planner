# 🍽️ Meal Planner Turborepo

[![Build and Push Docker Images](https://github.com/jenanos/meal-planner/actions/workflows/build-and-push.yml/badge.svg)](https://github.com/jenanos/meal-planner/actions/workflows/build-and-push.yml)

Meal Planner is a pnpm-powered Turborepo monorepo for planning dinners, managing recipes and ingredients, and preparing weekly shopping lists. It contains a Fastify+tRPC API, a Prisma/PostgreSQL data layer, and a modern Next.js frontend with real magic-link authentication.

---

## 🚀 Quick Start (Hybrid Dev)

**Forutsetninger**: Node.js 20+, pnpm 10+, Docker

```bash
# 1. Installer avhengigheter
pnpm install

# 2. Opprett miljøkonfigurasjon
cp .env.example .env
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.local.example apps/web/.env.local
# Rediger filene med ønskede verdier

# 3. Start Postgres i Docker (krever POSTGRES_PASSWORD)
export POSTGRES_PASSWORD=<ditt-passord>
docker compose up -d

# 4. Kjør migrasjoner og seed
pnpm db:migrate:dev
pnpm db:seed

# 5. Start alle tjenester via Turborepo
pnpm dev
```

**Tilgjengelige URLer:**
- 🌐 Frontend: [http://localhost:3000](http://localhost:3000)
- 🔌 API: [http://localhost:4000/ready](http://localhost:4000/ready)
- 🤖 MCP Server: [http://localhost:5050/mcp](http://localhost:5050/mcp)

**Nyttige kommandoer:**
- `pnpm dev` – Start alle tjenester parallelt med Turborepo
- `pnpm db:studio` – Åpne Prisma Studio for å se/redigere data
- `pnpm mcp:inspect` – Start MCP Inspector for å teste MCP-verktøy

---

## 🏎️ Turborepo at a glance

This workspace is orchestrated by [Turborepo](https://turbo.build/repo), a high-performance build system for JavaScript/TypeScript codebases. Turborepo parallelises your tasks, shares build artifacts through caching, and lets every package keep using familiar `package.json` scripts. You can adopt it incrementally—`turbo.json` declares how commands relate (`dev`, `build`, `lint`, database utilities, etc.), while `pnpm` continues to manage dependencies. Run any workspace task through Turbo with `pnpm <script>` (for example `pnpm dev` or `pnpm lint`) and it automatically schedules the necessary subtasks.

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
| **Frontend** | `apps/web` | Next.js App Router UI with Tailwind and tRPC React Query hooks. |
| **API server** | `apps/server` | Fastify host that mounts the tRPC router from `@repo/api` and exposes health/readiness endpoints. |
| **MCP server** | `apps/mcp-server` | Streamable HTTP MCP server that maps MCP tools to the Meal Planner tRPC API. |
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
```

Key settings:

- Root `.env` provides `POSTGRES_*` defaults that both Docker and Prisma use.
- `apps/server/.env` supplies `DATABASE_URL`, `AUTH_SECRET`, `BETTER_AUTH_URL`, `AUTH_TRUSTED_ORIGINS`, `RESEND_API_KEY`, and `EMAIL_FROM`.
- `MEALS_API_INTERNAL_ORIGIN` and `NEXT_PUBLIC_API_URL` control how the web app reaches the API (internal vs. browser).
- `ADMIN_EMAIL` promotes an existing user to app-admin and allowlists the address.
- `BOOTSTRAP_HOUSEHOLD_NAME`, `BOOTSTRAP_HOUSEHOLD_OWNER_EMAILS`, and `BOOTSTRAP_HOUSEHOLD_MEMBER_EMAILS` let you bootstrap one canonical household from env in both dev and prod.

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
   pnpm --filter @repo/database db:migrate:dev
   ```
4. **Seed base data (optional but recommended)**
   ```bash
   pnpm --filter @repo/database db:seed
   ```
   There is no separate dev-login flow anymore. To test the real auth flow locally, set `ADMIN_EMAIL`, `BOOTSTRAP_HOUSEHOLD_NAME`, `BOOTSTRAP_HOUSEHOLD_OWNER_EMAILS`, `BOOTSTRAP_HOUSEHOLD_MEMBER_EMAILS`, `AUTH_SECRET`, `BETTER_AUTH_URL`, `AUTH_TRUSTED_ORIGINS`, `RESEND_API_KEY`, and `EMAIL_FROM` in `apps/server/.env`.
5. **Start the API server** – runs Fastify on port `4000` by default and wires up the tRPC router. The `predev` hook automatically applies the latest Prisma migrations.
   ```bash
   pnpm --filter server dev
   ```
6. **Start the Next.js app** in another terminal (the `predev` hook builds shared packages first).
   ```bash
   pnpm --filter web dev
   ```
7. Visit [http://localhost:3000](http://localhost:3000) for the UI and [http://localhost:4000/ready](http://localhost:4000/ready) to verify API readiness.

> 💡 Prefer a single command? Run `pnpm dev` at the workspace root to launch both `server` and `web` via Turborepo task orchestration.

---

## 🤖 MCP server (optional)

The MCP server exposes Meal Planner actions (weekly plan, shopping list, ingredients, and recipes) through the Model Context Protocol. It runs as a Streamable HTTP MCP endpoint at `/mcp` and talks to the existing `meals-api` tRPC service. See `apps/mcp-server/README.md` for the full tool list.

```bash
cp apps/mcp-server/.env.example apps/mcp-server/.env
pnpm --filter mcp-server dev
```

Key settings:

- `MEALS_API_INTERNAL_ORIGIN` – base URL for the Meal Planner API (e.g. `http://localhost:4000` or `http://meals-api:4000` in Docker).
- `PORT` – port for the MCP server (default: `5050`).

---

## 🗃️ Database management

- **View data**: `pnpm --filter @repo/database studio` opens Prisma Studio.
- **Reset dev database**:
  ```bash
  pnpm --filter @repo/database db:reset
  pnpm --filter @repo/database db:seed
  ```
- **Seed dev from a plain prod dump**:
  ```bash
  pnpm db:push
  pnpm db:seed:prod -- /absolute/path/to/plain-pg-dump.sql
  ```
  This replaces current dev data, imports the prod dump into the current schema, and binds the migrated household to the bootstrap emails configured in `apps/server/.env`.
- **Force push schema (no migrations)**:
  ```bash
  pnpm --filter @repo/database exec prisma db push --force-reset
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
pnpm lint                    # ESLint across packages (turbo run lint)
pnpm --filter web lint       # Frontend lint only
pnpm --filter web test:e2e   # Playwright end-to-end tests (headless)
```

(Additional unit tests can live under each package; run them via `pnpm --filter <package> test` when available.)

---


## 🆘 Troubleshooting tips

- **API not ready**: check `apps/server` logs; ensure migrations ran and Postgres is reachable.
- **Frontend requests failing**: verify `NEXT_PUBLIC_API_URL` (browser) and `MEALS_API_INTERNAL_ORIGIN` (server-side) point to the API.
- **Magic links are not sent**: verify `RESEND_API_KEY`, `EMAIL_FROM`, `BETTER_AUTH_URL`, and `AUTH_TRUSTED_ORIGINS` in `apps/server/.env`.

---

## 📄 License

The project inherits the license defined in the repository. Review `LICENSE` (if present) before distribution.

---

## 🤖 AI Assistant Instructions

This repository is optimized for Turborepo. When assisting with code changes, please follow these guidelines:

1.  **Run Tasks via Turbo**: Use `pnpm <script>` or `turbo run <script>` to leverage caching and parallel execution.
    *   **Full Build**: `pnpm build` (runs `turbo run build`)
    *   **Type Check**: `pnpm check-types` (runs `turbo run check-types` across all packages without emitting files)
    *   **Lint**: `pnpm lint` (runs `turbo run lint`)
    *   **Dev Server**: `pnpm dev` (starts all apps and packages in watch mode)

2.  **Package Scoping**: When working on a specific package or app, use the `--filter` flag.
    *   Example: `pnpm --filter web add button` (adds dependency to web app)
    *   Example: `pnpm --filter @repo/ui test` (runs tests for UI package only)

3.  **File Structure**:
    *   `apps/` contains deployable applications (`web`, `server`, etc.).
    *   `packages/` contains shared libraries (`ui`, `database`, `api`, etc.).
    *   Do not edit `pnpm-lock.yaml` manually.

4.  **Database**:
    *   Interact with the database using scripts in `@repo/database`.
    *   Migration: `pnpm --filter @repo/database db:migrate:dev`
    *   Studio: `pnpm --filter @repo/database studio`

5.  **New Packages**: If creating a new package, remember to add it to `pnpm-workspace.yaml` (if not covered by glob) and configure `package.json` with `"name": "@repo/<name>"` and `"private": true`.
