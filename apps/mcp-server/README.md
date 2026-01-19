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
- `remove-extra-shopping-item` → `planner.extraRemove`
- `add-extra-item-to-catalog` → `planner.extraAdd`
- `list-ingredients` → `ingredient.list`
- `create-ingredient` → `ingredient.create`
- `update-ingredient` → `ingredient.update`
- `get-ingredient-with-recipes` → `ingredient.getWithRecipes`
- `get-ingredients-without-unit` → `ingredient.listWithoutUnit`
- `bulk-update-missing-ingredient-units` → `ingredient.listWithoutUnit` + `ingredient.bulkUpdateUnits`
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

When running in Docker Compose, point `MEALS_API_INTERNAL_ORIGIN` at the `meals-api` service (for example `http://meals-api:4000`) and expose the MCP server at `/mcp` on the container port.
