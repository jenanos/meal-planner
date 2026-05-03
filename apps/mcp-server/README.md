# Meal Planner MCP Server

This service exposes a Model Context Protocol (MCP) server that maps MCP tools to the Meal Planner tRPC API. It is designed to run alongside the existing `meals-api` container and lets MCP clients (including ChatGPT) read and update weekly plans.

## Features

- `get-week-plan` → `planner.getWeekPlan`
- `generate-week-plan` → `planner.generateWeekPlan`
- `save-week-plan` → `planner.saveWeekPlan`
- `get-shopping-list` → `planner.shoppingList`
- `update-shopping-item` → `planner.updateShoppingItem`
- `update-shopping-items-by-name` → `planner.shoppingList` + `planner.updateShoppingItem`
- `suggest-extra-shopping-items` → `planner.extraSuggest`
- `add-extra-shopping-item` → `planner.extraToggle`
- `smart-add-extra-shopping-item` → `planner.extraSuggest` + `planner.extraToggle` (med duplikatsjekk)
- `batch-add-extra-shopping-items` → `planner.extraSuggest` + `planner.extraToggle` (bulk med duplikatsjekk)
- `remove-extra-shopping-item` → `planner.extraRemove`
- `add-extra-item-to-catalog` → `planner.extraAdd`
- `list-ingredients` → `ingredient.list`
- `create-ingredient` → `ingredient.create`
- `update-ingredient` → `ingredient.update`
- `get-ingredient-with-recipes` → `ingredient.getWithRecipes`
- `get-ingredients-without-unit` → `ingredient.listWithoutUnit`
- `get-ingredients-without-category` → `ingredient.listWithoutCategory`
- `bulk-update-missing-ingredient-units` → `ingredient.listWithoutUnit` + `ingredient.bulkUpdateUnits`
- `bulk-update-missing-ingredient-categories` → `ingredient.listWithoutCategory` + `ingredient.bulkUpdateCategories`
- `bulk-update-ingredient-categories` → `ingredient.bulkUpdateCategories`
- `get-potential-duplicate-ingredients` → `ingredient.listPotentialDuplicates`
- `bulk-update-ingredient-units` → `ingredient.bulkUpdateUnits`
- `list-recipes` → `recipe.list`
- `get-recipe` → `recipe.getById`
- `create-recipe` → `recipe.create`
- `update-recipe` → `recipe.update`
- `delete-recipe` → `recipe.delete`

## Configuration

Copy the sample environment file and adjust as needed:

```bash
cp .env.example .env
```

Environment variables:

- `MEALS_API_INTERNAL_ORIGIN` – base URL for the Meal Planner API (default: `http://localhost:4000`).
- `PORT` – port to expose the MCP server (default: `5050`).
- `DATABASE_URL` – required. The MCP server itself never queries Postgres, but importing `@repo/api` transitively loads `@repo/database`, which instantiates the Prisma client at module load and throws if `DATABASE_URL` is unset. Point it at the same Postgres instance as `meals-api`; the connection is lazy and never opened in practice.
- `MCP_API_KEY` – shared secret sent as `x-api-key` to the Meal Planner API for service-to-service auth. Must match `MCP_API_KEY` in `apps/server/.env`. Generate with `openssl rand -base64 32`. Without it the API rejects every MCP call as `UNAUTHORIZED`.
- `MCP_BEARER_TOKEN` – optional. When set, every incoming `/mcp` request must include `Authorization: Bearer <token>`. When empty, `/mcp` is open to anyone who can reach the container, so an external gate (Cloudflare Access, mTLS, VPN) is required.
- `MCP_ALLOWED_HOSTS` – optional comma-separated list of `Host` headers accepted by the server (DNS rebinding protection). Example: `meals-mcp.example.com,meals-mcp:5050,localhost:5050`.

## Auth, identity, and which household the tools touch

The MCP server has no concept of users. It opens one anonymous tRPC client to `meals-api` and forwards every tool call with the shared `MCP_API_KEY`. On the API side that key is recognised in `createContext` and produces a synthetic context:

- `user.id = "service:mcp"`, `user.role = "USER"` – not stored in the `User` table; only lives inside the tRPC context.
- `householdId` is resolved by `resolveServiceHouseholdId()`:
  1. The household whose name equals `BOOTSTRAP_HOUSEHOLD_NAME` (recommended).
  2. Otherwise, the oldest household in the database (fallback — only deterministic while you have one household).

Because of this:

- All `planner.*`-backed tools (`get-week-plan`, `save-week-plan`, `get-shopping-list`, `update-shopping-item`, `extra-*`, …) read and write data scoped to that single household.
- `recipe.*` and `ingredient.*` are **not** household-scoped in this codebase. They are global, so any change MCP makes there is visible to every household in the same database.

To make this deterministic in production, set `BOOTSTRAP_HOUSEHOLD_NAME` (and at least one of the bootstrap email lists) on the API server.

## Local development

```bash
pnpm --filter mcp-server dev
```

## Build & start

```bash
pnpm --filter mcp-server build
pnpm --filter mcp-server start
```

## Deployment notes

When running in Docker Compose, point `MEALS_API_INTERNAL_ORIGIN` at the `meals-api` service (for example `http://meals-api:4000`) and expose the MCP server at `/mcp` on the container port. Set `MCP_API_KEY` to the same value configured on `meals-api`, and set `MCP_ALLOWED_HOSTS` to include the public domain and the internal compose service name (e.g. `meals-mcp.example.com,meals-mcp:5050`).

For public deployments, gate `/mcp` with at least one of:

- An external auth layer (Cloudflare Access, mTLS, VPN), **or**
- `MCP_BEARER_TOKEN`. Clients then send `Authorization: Bearer <token>` on every request.

Both can be combined.

## Connecting a client

Example for an MCP client that supports a Streamable HTTP server with custom headers:

```jsonc
{
  "mcpServers": {
    "meal-planner": {
      "url": "https://meals-mcp.example.com/mcp",
      "transport": "streamable-http",
      "headers": {
        "Authorization": "Bearer <MCP_BEARER_TOKEN>"
      }
    }
  }
}
```

If you protect the endpoint with Cloudflare Access service tokens instead, replace the bearer header with `CF-Access-Client-Id` / `CF-Access-Client-Secret`.
