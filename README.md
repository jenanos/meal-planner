# 🍽️ Meal Planner Monorepo

En moderne monorepo-app for å:
- 📚 Administrere oppskrifter (med kategorier, ingredienser og poeng)
- 🧾 Se og administrere ingredienser med referanser til oppskrifter
- 🗓️ Generere og lagre ukentlig middagsplan (auto-forslag m/ regler)
- 🔁 Spore bruk (usageCount + lastUsed) for bedre forslag

---

## 🗂️ Teknologistack

| Område        | Valg |
|---------------|------|
| Monorepo      | pnpm workspaces |
| Database      | PostgreSQL (Docker + Prisma) |
| API           | tRPC + Fastify |
| Frontend      | Next.js (App Router) |
| UI            | Tailwind + interne komponenter |
| Validering    | Zod |
| Datafetch     | @tanstack/react-query via tRPC |
| Testing       | (plass til Vitest / Playwright) |

---

## 🚀 Kom i gang (første gang på ny maskin)

```bash
# 1. Klon repo
git clone <repo-url> meal-planner
cd meal-planner

# 2. Installer pnpm hvis du ikke har
npm i -g pnpm

# 3. Installer avhengigheter
pnpm install

# 4. Sett opp miljøvariabler
#   cp .env.example .env
#   cp packages/database/prisma/.env.example packages/database/prisma/.env
#   cp apps/server/.env.example apps/server/.env
#   cp apps/web/.env.local.example apps/web/.env.local
#   # Fyll inn egne verdier (bruk <db-host>, <db-port>, <db-name>, <your-password> som hint)

# 5. Start Postgres (Docker Desktop må kjøre)
POSTGRES_PASSWORD=<ditt-passord> docker compose up -d postgres
# eller kopier `.env.example` til `.env` i rotkatalogen og fyll inn Postgres-verdiene først

# 6. Kjør migrasjoner mot Postgres
pnpm --filter @repo/database db:migrate:deploy

# 7. Seed eksempeldata
pnpm --filter @repo/database db:seed

# 8. Start API-server
pnpm --filter server dev

# 9. Start web (ny terminal)
pnpm --filter web dev

# Åpne: http://localhost:3000
```

---

## 🔑 Viktige filer

| Domene | Fil |
|--------|-----|
| Database schema | [`packages/database/prisma/schema.prisma`](packages/database/prisma/schema.prisma) |
| Seed-data | [`packages/database/src/seed.ts`](packages/database/src/seed.ts) |
| Server bootstrap | [`apps/server/src/index.ts`](apps/server/src/index.ts) |
| Planner (forside) | [`apps/web/app/page.tsx`](apps/web/app/page.tsx) |
| Oppskrifter | [`apps/web/app/recipes/page.tsx`](apps/web/app/recipes/page.tsx) |
| Ingredienser | [`apps/web/app/ingredients/page.tsx`](apps/web/app/ingredients/page.tsx) |
| Planner API | [`packages/api/src/routers/planner.ts`](packages/api/src/routers/planner.ts) |
| Recipe API | [`packages/api/src/routers/recipe.ts`](packages/api/src/routers/recipe.ts) |
| Ingredient API | [`packages/api/src/routers/ingredient.ts`](packages/api/src/routers/ingredient.ts) |

---

## 🧪 Kjøre tester (placeholder)

```bash
# (legg til når testene er implementert)
pnpm --filter @repo/api test
pnpm --filter web test:e2e
```

---

## 🗓️ Planner-logikk (kort)

Planner fordeler mål-kvoter per uke (default):
- FISK: 2 • VEGETAR: 3 • KYLLING: 1 • STORFE: 1  
Regler:
- Man–ons: prefererer lav everydayScore og høy healthScore  
- Tor–lør: tillater høy everydayScore (helgekos)  
- Søndag: balanse
- Bonus ved lang tid siden lastUsed (default gap ≥21 dager)
- Ingrediens-overlapp prioriteres (for enklere handel)

Genereres via [`plannerRouter.generateWeekPlan`](packages/api/src/routers/planner.ts).

---

## ➕ Legge til oppskrift

1. Gå til `/recipes`
2. Fyll navn, kategori, scores og ingredienser
3. Oppskriften dukker direkte i lista (tRPC + react-query refresh)

---

## 🧂 Ingredienser

Siden `/ingredients` lar deg:
- Søke og legge til ingredienser (upsert per navn)
- Se hvilke oppskrifter som bruker en valgt ingrediens

Data hentes via [`ingredientRouter`](packages/api/src/routers/ingredient.ts).

---

## 🔄 Resette databasen (dev)

Bruk hvis schema endres kraftig eller du vil starte utviklingsdatabasen på nytt.

```bash
pnpm --filter @repo/database prisma migrate reset -f
pnpm --filter @repo/database db:seed
```

Alternativ uten migrasjoner (force push):
```bash
pnpm --filter @repo/database prisma db push --force-reset
pnpm --filter @repo/database db:seed
```

---

## 🧵 Miljøvariabler

| Miljø | Fil (ikke sjekk inn) | Beskrivelse |
|-------|----------------------|-------------|
| Dev   | `.env`                               | Delte variabler for Docker Compose (`POSTGRES_*`). |
| Dev   | `packages/database/prisma/.env`      | `DATABASE_URL` for lokal Postgres (bruk samme verdier som i `.env`). |
| Dev   | `apps/server/.env`                   | Serverens `DATABASE_URL` (bruk samme verdier som over). |
| Dev   | `apps/web/.env.local`                | Frontend-URLer (f.eks. `NEXT_PUBLIC_API_URL`). |
| Prod  | `.env.production`                    | Compose-variabler for prod-stack. Kjør `docker compose --env-file .env.production …`. |
| Prod  | `packages/database/prisma/.env.production` | Brukes av Prisma CLI mot prod (`--env-file prisma/.env.production`). |
| Prod  | `apps/server/.env.production`        | Prod-runtime for server (settes gjerne som secrets). |
| Prod  | `apps/web/.env.production`           | Next.js build/runtime-variabler for prod (f.eks. ekstern API-URL). |

Malfilene `*.env.example` viser hvilke variabler som trengs. Kopiér til ønsket fil og fyll inn hemmelige verdier. For å bytte mellom dev/prod ved bruk av Prisma CLI kan du f.eks. kjøre:

```bash
pnpm --filter @repo/database prisma migrate deploy --env-file prisma/.env.production
```

I prod anbefales det å bruke container-/plattform-secrets i stedet for `.env`-filer.

---

## 🏗️ Struktur (kort)

```
apps/
  server/        # Fastify + tRPC-adapter
  web/           # Next.js (App Router)
packages/
  api/           # tRPC routere + Zod-skjema
  database/      # Prisma schema + seed + client
  ui/            # Delte UI-komponenter
```

---

## 🧠 Ytelsesnotat

Datasettet er lite → frontend kan hente “alt” (pageSize=1000) og filtrere lokalt for å redusere API-kall (se oppskriftssiden). For større datamengder: gjeninnfør server-side filtrering via query-parametre.

---

## 🛣️ Videre forbedringer (idéer)

- ✅ Drag & drop i planner (egen komponent)
- 📊 Historikkside: kategori- og ingrediensfordeling
- 👥 Multi-husholdning / preferanser
- ☁️ Prod-compose med Postgres + backup-rutiner
- 🔒 Auth + roller
- 📱 PWA / offline caching

---

## ⚙️ Feilsøking

| Problem | Løsning |
|---------|---------|
| tRPC context-feil | Sjekk at `<Providers>` wrapper layout |
| Manglende kolonne | Kjør migrate reset / db push |
| Ingen data | Kjør seed-script |
| 500 på planner | Sjekk at seed gir nok oppskrifter per kategori |

---

## 🔐 Lisens

(Angi lisens om ønskelig – MIT, Apache 2.0, etc.)

---

God hacking! 🧪 Si fra hvis du ønsker automatiserte tester, Postgres-oppsett eller dnd-forbedringer.
