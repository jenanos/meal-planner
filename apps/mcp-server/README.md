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
- `MCP_API_KEY` – shared secret sent as `x-api-key` to the Meal Planner API for service-to-service auth. Must match `MCP_API_KEY` in `apps/server/.env`. Generate with `openssl rand -base64 32`.
- `MCP_ALLOWED_HOSTS` – optional comma-separated list of `Host` headers accepted by the server (DNS rebinding protection). Example: `meals-mcp.example.com,meals-mcp:5050,localhost:5050`.

All tool calls run as the bootstrap household configured on the Meal Planner API (see `BOOTSTRAP_HOUSEHOLD_*` in the server env).

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
