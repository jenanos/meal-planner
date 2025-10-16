# AI coding agents guide for this repo

This monorepo contains a Next.js web app, a Fastify+tRPC server, a Prisma database package, and a shared UI library. Keep your edits minimal, respect the packages’ contracts, and validate with lint + build before finishing.

## Architecture at a glance
- apps/web: Next.js (App Router) frontend
  - State/data via tRPC React Query client in `apps/web/lib/trpcClient.ts`
  - Pages under `apps/web/app/**` (e.g. `/planner`, `/recipes`, `/ingredients`)
  - DnD in planner uses `@dnd-kit` with separate DndContext for mobile vs desktop, and a DragOverlay portaled to `document.body` to avoid offset bugs
  - Shared navigation for multi-step dialogs lives in `app/recipes/components/StepNav.tsx`
- apps/server: Fastify + tRPC
  - Entry: `apps/server/src/index.ts`
  - Routers live in `packages/api/src/routers/*` and are imported into server
- packages/api: tRPC routers and Zod schemas
  - Single exported `AppRouter` type consumed by the web client
- packages/database: Prisma schema, client, and seeds
  - Schema: `packages/database/prisma/schema.prisma`
  - Seed: `packages/database/src/seed.ts`
- packages/ui: shared UI (shadcn-based + magicui). Import via `@repo/ui`.

## Key conventions and patterns
- Type flow: server exports `AppRouter` → web imports the type in `trpcClient.ts`; avoid importing built output.
- Planner DnD: do not reintroduce transforms/backdrop-filter on containers that would create containing blocks; keep DragOverlay in a portal to `document.body`.
- Recipe dialogs: use `StepNav` for navigation (arrows always enabled). Primary actions live in the dialog header (left); a close “X” sits in header (right). StepNav should not render extra right-side actions. Validation gating happens on the header button (disabled until required data is set).
- Category visuals: use `CategoryEmoji` (app/components/CategoryEmoji.tsx) instead of raw text where space is tight.
- Scores: surface labels via `describeEveryday/describeHealth` from `apps/web/lib/scoreLabels.ts` instead of raw numbers in the view dialog.
- Details step (form): category is chosen via an emoji button row (FISK, KYLLING, VEGETAR, ANNET). Everyday/Health selects render side-by-side on the next row.
- Dialog footers are removed (empty) — don’t add actions there.

## Developer workflows
- Install: `pnpm install` in repo root (pnpm workspaces)
- Run web (mock mode, no backend): `pnpm --filter web dev:mock`
- Run server (dev): `pnpm --filter server dev` (runs Prisma dev migrations)
- Run web (real backend): ensure Postgres + server are up, then `pnpm --filter web dev`
- Lint (strict, no warnings allowed): `pnpm lint`
- Build all: `pnpm build`
- Database
  - Apply migrations (dev): `pnpm --filter @repo/database prisma migrate dev`
  - Reset and seed: `pnpm --filter @repo/database prisma migrate reset -f && pnpm --filter @repo/database db:seed`

## External dependencies
- tRPC v11 for end-to-end types
- Prisma for DB access and migrations
- Tailwind (v4) for styles; UI via `@repo/ui` (shadcn + magicui)
- dnd-kit for drag-and-drop

## Cross-package boundaries
- Do not import from a package’s build output; use source entrypoints (e.g., `@repo/api`, `@repo/ui`).
- The web app expects tRPC procedures as defined in `packages/api/src/routers/*`; adjust both client and server when renaming procedures or shapes.

## Testing
- E2E scaffolding via Playwright in `apps/web/tests/`; run with `pnpm --filter web test:e2e` (if tests exist).

## Examples from codebase
- Step navigation with labels: `apps/web/app/recipes/components/StepNav.tsx`
- Category emoji usage: `apps/web/app/components/CategoryEmoji.tsx` and `apps/web/app/recipes/components/RecipeCard.tsx`
- Recipe dialogs (header actions + StepNav): `apps/web/app/recipes/components/RecipeFormDialog.tsx`, `RecipeViewDialog.tsx`
- Planner DnD setup: `apps/web/app/planner/page.tsx`

## Guardrails for agents
- Maintain separate DnD contexts for mobile/desktop and keep `DragOverlay` portaled.
- Don’t use dialog footers for actions (actions belong in header; StepNav only for nav).
- Respect the strict ESLint config (`--max-warnings 0`); fix unused imports/vars.
- Prefer label-based display for scores on view.
- When changing public UI in `@repo/ui`, rebuild it (tsup) before web build; root `pnpm build` handles this.
