# Meal Planner MCP Server

This service exposes a Model Context Protocol (MCP) server that maps MCP tools to the Meal Planner tRPC API. It is designed to run alongside the existing `meals-api` container and lets MCP clients (including ChatGPT and Claude) read and update weekly plans.

The server includes its own OAuth 2.1 + PKCE authorization server so that clients which only support OAuth (such as ChatGPT custom connectors) can connect without a static bearer token. User authentication is delegated to the existing better-auth setup on the meals web app — the MCP server validates the shared session cookie via the meals API and then issues its own JWT access tokens.

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

Required environment variables:

- `MEALS_API_INTERNAL_ORIGIN` – base URL for the Meal Planner API. Used for both forwarded tRPC calls and for validating better-auth sessions during the OAuth login flow (the MCP server calls `${MEALS_API_INTERNAL_ORIGIN}/auth/get-session`). Default: `http://localhost:4000`.
- `DATABASE_URL` – Postgres connection string. The MCP server uses this for OAuth provider state (clients, codes, refresh tokens). Point it at the same instance as `meals-api`.
- `MCP_API_KEY` – shared secret sent as `x-api-key` to the Meal Planner API for service-to-service auth. Must match `MCP_API_KEY` in `apps/server/.env`. Generate with `openssl rand -base64 32`.
- `MCP_OAUTH_ISSUER` – public origin of this MCP server, e.g. `https://meals-mcp.example.com`. Used as the OAuth issuer in tokens and discovery metadata.
- `MCP_OAUTH_SIGNING_SECRET` – HMAC secret used to sign JWT access tokens. Generate with `openssl rand -base64 64`.
- `MCP_OAUTH_LOGIN_URL` – public URL of the meals web app's login page. Unauthenticated `/oauth/authorize` requests are redirected here with `?callbackUrl=…`.

Optional:

- `MCP_OAUTH_ACCESS_TOKEN_TTL` – access token lifetime in seconds. Default: `3600` (1 hour).
- `MCP_OAUTH_REFRESH_TOKEN_TTL` – refresh token lifetime in seconds. Default: `2592000` (30 days).
- `PORT` – port to expose the MCP server. Default: `5050`.
- `MCP_ALLOWED_HOSTS` – comma-separated list of `Host` headers accepted by the server (DNS rebinding protection).

## OAuth flow overview

The MCP server hosts a complete OAuth 2.1 authorization server with PKCE and Dynamic Client Registration:

| Endpoint                                          | Purpose                                  |
| ------------------------------------------------- | ---------------------------------------- |
| `GET /.well-known/oauth-authorization-server`     | RFC 8414 metadata (auth + token URLs)    |
| `GET /.well-known/oauth-protected-resource`       | RFC 9728 resource metadata               |
| `POST /oauth/register`                            | RFC 7591 Dynamic Client Registration     |
| `GET /oauth/authorize`                            | Authorization endpoint (PKCE S256 only)  |
| `POST /oauth/token`                               | Token endpoint (`authorization_code`, `refresh_token`) |
| `POST /mcp`                                       | Protected MCP endpoint (`Authorization: Bearer <jwt>`) |

When a client hits `/oauth/authorize` without a valid better-auth session cookie, the server redirects to `MCP_OAUTH_LOGIN_URL?callbackUrl=…`. The web app's login page authenticates the user (magic link or OTP via better-auth) and sends them back to `/oauth/authorize`, which then issues an authorization code. Token exchange validates PKCE and returns a JWT access token plus a rotating opaque refresh token.

For the cookie share to work, better-auth on `meals-api` must be configured with `BETTER_AUTH_COOKIE_DOMAIN` set to the parent domain (e.g. `.jenanos.xyz`).

## Connecting from ChatGPT

1. In ChatGPT → "Ny app" → set the URL to `https://<your-mcp-host>/mcp`.
2. Choose **OAuth** as authentication.
3. Use **dynamic client registration** — once ChatGPT discovers `registration_endpoint` in the metadata it can register itself with no manual client_id needed.

ChatGPT will register itself, redirect you to the meals web app to log in, then come back and complete the token exchange.

## Connecting from Claude (or other MCP clients)

```jsonc
{
  "mcpServers": {
    "meal-planner": {
      "url": "https://meals-mcp.example.com/mcp",
      "transport": "streamable-http",
      "auth": {
        "type": "oauth",
        "metadata_url": "https://meals-mcp.example.com/.well-known/oauth-authorization-server"
      }
    }
  }
}
```

Clients without OAuth support are no longer accepted — the previous static `MCP_BEARER_TOKEN` path has been removed.

## Auth, identity, and which household the tools touch

After OAuth, every MCP tool call carries the authenticated user's identity. The MCP server forwards the user id to `meals-api` via `x-mcp-on-behalf-of` alongside the existing `x-api-key` header. The API resolves the user's household via their `HouseholdMember` rows, exactly the same way the regular tRPC clients do for browser sessions.

This means:

- `planner.*`-backed tools read and write data scoped to the user's active household — `BOOTSTRAP_HOUSEHOLD_NAME` is only used as a tie-breaker when the user is in multiple households.
- `recipe.*` and `ingredient.*` tools are still global (not household-scoped) – any change is visible to every household.

## Local development

```bash
pnpm --filter mcp-server dev
```

For local OAuth testing, set:

```bash
MCP_OAUTH_ISSUER=http://localhost:5050
MCP_OAUTH_LOGIN_URL=http://localhost:3000/login
MCP_OAUTH_SIGNING_SECRET=$(openssl rand -base64 64)
```

Note: when both apps run on `localhost`, the cross-subdomain cookie share isn't needed — but you also won't be testing the production cookie path. End-to-end testing of OAuth is best done on real subdomains.

## Build & start

```bash
pnpm --filter mcp-server build
pnpm --filter mcp-server start
```
