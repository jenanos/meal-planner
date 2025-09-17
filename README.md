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
| Database      | SQLite (Prisma) |
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
# (disse filene finnes allerede – verifiser)
# apps/web/.env.local
#   NEXT_PUBLIC_API_URL=http://localhost:4000
#
# packages/database/prisma/.env
#   DATABASE_URL="file:./dev.db"

# 5. Kjør migrasjoner (lager / oppdaterer dev.db)
pnpm -C packages/database exec prisma migrate dev -n mealplanner_core

# 6. Seed eksempeldata
pnpm -C packages/database exec prisma db seed

# 7. Start API-server
pnpm --filter server dev

# 8. Start web (ny terminal)
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

Bruk hvis schema endres kraftig eller dev.db blir inkonsistent.

```bash
pnpm -C packages/database exec prisma migrate reset -f
pnpm -C packages/database exec prisma db seed
```

Alternativ uten migrasjoner (force push):
```bash
pnpm -C packages/database exec prisma db push --force-reset
pnpm -C packages/database exec prisma db seed
```

---

## 🧵 Miljøvariabler

| App | Fil | Viktig |
|-----|-----|--------|
| Web | `apps/web/.env.local` | NEXT_PUBLIC_API_URL |
| DB  | `packages/database/prisma/.env` | DATABASE_URL |

For lokal utvikling er standardene allerede satt.

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
- ☁️ Postgres-migrering (prod)
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

