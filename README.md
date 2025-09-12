# Meal Planner

Monorepo with a simple recipe CRUD and weekly meal planner.

## Development

```bash
# Install deps (once)
pnpm install

# Run database migrations
pnpm -C packages/database exec prisma migrate dev -n init_mealplanner

# Seed demo data
pnpm -C packages/database run db:seed

# Start API server
pnpm --filter server dev

# In another terminal, start Next.js web app
pnpm --filter web dev
```

The API runs on `http://localhost:4000` and the web app on `http://localhost:3000`.

Frontend expects `NEXT_PUBLIC_API_URL=http://localhost:4000`.

## Tests

```bash
pnpm --filter @repo/api test
pnpm --filter web test:e2e
```

