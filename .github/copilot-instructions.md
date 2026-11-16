# AI coding agents guide for this repo

This monorepo contains a Next.js web app, a Fastify+tRPC server, a Prisma database package, and a shared UI library. Keep your edits minimal, respect the packages’ contracts, and validate with lint + build before finishing.

## Architecture at a glance

- apps/web: Next.js (App Router) frontend
  - State/data via tRPC React Query client in `apps/web/lib/trpcClient.ts`
  - Pages under `apps/web/app/**` (e.g. `/planner`, `/recipes`, `/ingredients`)
  - DnD in planner uses `@dnd-kit` with separate DndContext for mobile vs desktop, and a DragOverlay portaled to `document.body` to avoid offset bugs
  - Overlays use the shared `Sheet` in `app/components/Sheet.tsx`: sized to the visible viewport (so the on-screen keyboard shrinks it rather than covering it) and closed by the system back button
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
- Recipe sheets: viewing and editing are each one scrolling page in a `Sheet` – no steps or carousels. The dismiss button sits top left and the primary action top right in the sheet header, where the keyboard never covers it. Validation gating happens on that header button (disabled until required data is set).
- Category visuals: use `CategoryEmoji` (app/components/CategoryEmoji.tsx) instead of raw text where space is tight.
- Scores: surface labels via `describeEveryday/describeHealth` from `apps/web/lib/scoreLabels.ts` instead of raw numbers in the view dialog.
- Recipe form: category is chosen via an emoji button row; everyday/health scores are 1–5 segmented controls that spell out the chosen level. Touch targets are at least 44px and inputs at least 16px text (smaller text makes iOS zoom on focus).
- Don’t put actions in a footer at the bottom of a sheet — that is where the keyboard is.

## Developer workflows

- Install: `pnpm install` in repo root (pnpm workspaces)
- Copy shared env from `.env.example`, then copy auth/server env from `apps/server/.env.example` to `apps/server/.env`
- Local dev uses the same real auth flow as prod: magic links via Better Auth + Resend
- Run server (dev): `pnpm --filter server dev` (applies current Prisma migrations via `predev`)
- Run web (dev): ensure Postgres + server are up, then `pnpm --filter web dev`
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

- Category emoji usage: `apps/web/app/components/CategoryEmoji.tsx` and `apps/web/app/recipes/components/RecipeCard.tsx`
- Sheets (header actions, keyboard handling): `apps/web/app/components/Sheet.tsx`, used by `apps/web/app/recipes/components/RecipeFormSheet.tsx`, `RecipeViewSheet.tsx` and `apps/web/app/ingredients/components/IngredientSheet.tsx`
- Planner DnD setup: `apps/web/app/planner/page.tsx`

## Guardrails for agents

- Maintain separate DnD contexts for mobile/desktop and keep `DragOverlay` portaled.
- Don’t use footers for sheet actions (actions belong in the header).
- Respect the strict ESLint config (`--max-warnings 0`); fix unused imports/vars.
- Prefer label-based display for scores on view.
- When changing public UI in `@repo/ui`, rebuild it (tsup) before web build; root `pnpm build` handles this.
