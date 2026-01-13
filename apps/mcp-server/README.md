# Meal Planner MCP Server

This service exposes a Model Context Protocol (MCP) server that maps MCP tools to the Meal Planner tRPC API. It is designed to run alongside the existing `meals-api` container and lets MCP clients (including ChatGPT) read and update weekly plans.

## Features

- `get-week-plan` → `planner.getWeekPlan`
- `generate-week-plan` → `planner.generateWeekPlan`
- `save-week-plan` → `planner.saveWeekPlan`

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
