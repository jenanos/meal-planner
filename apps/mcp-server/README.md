# Meal Planner MCP Server

This service exposes a Model Context Protocol (MCP) server on top of the Meal Planner tRPC API. It runs alongside the `meals-api` container and lets MCP clients (ChatGPT, Claude and others) do everything the web and admin apps can do: plan weeks, manage recipes and ingredients, work the shopping list, keep the freezer inventory, and — for administrators — manage users, sign-in access and households.

The server includes its own OAuth 2.1 + PKCE authorization server so that clients which only support OAuth (such as ChatGPT custom connectors) can connect without a static bearer token. User authentication is delegated to the existing better-auth setup on the meals web app — the MCP server validates the shared session cookie via the meals API and then issues its own JWT access tokens.

## What the server offers

39 tools for every user. A further 11 `admin-*` tools (users, sign-in access, households) exist but are **switched off by default**: they are only registered when `MCP_ENABLE_ADMIN_TOOLS=true`, and then only for users with the `ADMIN` role (the API enforces the role on every call as well). See [Admin tools](#admin-tools).

| Area | Tools |
| --- | --- |
| Context | `get-context` (today's date, current/next week, user, role, household) |
| Week plan | `get-week-plan`, `list-weeks`, `set-week-plan-days`, `generate-week-plan`, `suggest-recipes` |
| Recipes | `list-recipes`, `get-recipe`, `create-recipe`, `update-recipe`, `delete-recipe` |
| Ingredients | `list-ingredients`, `get-ingredient`, `create-ingredient`, `update-ingredient`, `bulk-update-ingredients`, `find-duplicate-ingredients`, `merge-ingredients` |
| Shopping list | `get-shopping-list`, `check-shopping-items`, `update-shopping-item`, `add-extra-shopping-items`, `remove-extra-shopping-items` |
| Extra item catalog | `list-extra-catalog`, `add-extra-catalog-item`, `set-extra-catalog-categories`, `find-duplicate-extra-items`, `merge-extra-catalog-items` |
| Shopping packages | `list-shopping-packages`, `create-shopping-package`, `update-shopping-package`, `delete-shopping-package`, `add-shopping-package-to-list` |
| Freezer | `list-freezer`, `set-freezer-item`, `adjust-freezer-portions` |
| Settings | `get-shopping-settings`, `update-shopping-settings`, `create-shopping-store` |
| Admin: access | `admin-list-allowed-emails`, `admin-add-allowed-email`, `admin-remove-allowed-email` |
| Admin: users | `admin-list-users`, `admin-set-user-role` |
| Admin: households | `admin-list-households`, `admin-create-household`, `admin-rename-household`, `admin-delete-household`, `admin-set-household-member`, `admin-remove-household-member` |

It also sends server `instructions` (the domain model in a few lines) and three prompts: `planlegg-uka`, `handleliste` and `rydd-i-varer`.

### Conventions

- **Weeks.** Tools take a `week` argument: any date in the week (`YYYY-MM-DD`) or `current` / `next` / `previous`. Omitted means the current week in `MCP_TIMEZONE`. `dayIndex` 0 is Monday.
- **Names instead of IDs.** Recipes, packages, shopping items, stores, users and households can be referred to by name. An exact (case-insensitive) match wins, a single partial match is accepted, and anything ambiguous is returned as an error with the candidates — the server never guesses.
- **Partial updates.** `update-ingredient` and `update-shopping-settings` change only the fields given, even though the underlying API calls replace the whole record.
- **Freezer sync.** `set-week-plan-days` and `generate-week-plan` move freezer portions the way the web planner does: planning a `FREEZER` day takes a portion out (and is refused if there is none), removing one puts it back. Pass `syncFreezer: false` to leave the inventory alone.
- **Compact results.** Lists return summaries by default; ask for `includeIngredients` / `includeDetails` when the detail is needed.
- **Errors.** Failures come back with `isError: true` and an `error` message written for the model.
- **Annotations.** Every tool declares `readOnlyHint` / `destructiveHint` / `idempotentHint`. Anything that can delete data or replace it wholesale is marked destructive — `delete-*`, `merge-*`, `remove-*`, `generate-week-plan`, and also `set-week-plan-days`, `update-recipe`, `update-shopping-package`, `set-freezer-item` and `adjust-freezer-portions` — so clients can ask for confirmation. `admin-delete-household` additionally requires the household's exact name as confirmation.
- **Concurrency.** `set-week-plan-days` and `generate-week-plan` are a single API call (`planner.setWeekPlanDays` / `planner.generateWeekPlan`) that changes the days and the freezer portions in one database transaction, under a lock on the household's week. Parallel edits of different days all survive — whether they come from MCP, the web app or another household member — and the plan and the freezer either both change or neither does.
- **Weeks beyond the planning horizon.** The API answers such requests with the last plannable week. Read tools pass that on with a `note`; tools that change something refuse instead of touching another week.

### Adding a tool

Tools live in `src/tools/`, one file per area, and are registered with `defineTool` from `src/tools/helpers.ts`. `test/app.test.ts` fails when the API has a procedure that no tool calls, so a new tRPC procedure needs either a tool or an entry in that test's `NOT_EXPOSED` list explaining why it has none.

## Configuration

Copy the sample environment file and adjust as needed:

```bash
cp .env.example .env
```

Required environment variables:

- `MEALS_API_INTERNAL_ORIGIN` – base URL for the Meal Planner API. Used for both forwarded tRPC calls and for validating better-auth sessions during the OAuth login flow (the MCP server calls `${MEALS_API_INTERNAL_ORIGIN}/auth/get-session`). Default: `http://localhost:4000`.
- `DATABASE_URL` – Postgres connection string. OAuth provider state (registered clients, authorization codes, refresh tokens, consent decisions) is stored here, so connected clients survive restarts and deploys. Point it at the same instance as `meals-api`; the tables are created by the same Prisma migrations.
- `MCP_API_KEY` – shared secret sent as `x-api-key` to the Meal Planner API for service-to-service auth. Must match `MCP_API_KEY` in `apps/server/.env`. Generate with `openssl rand -base64 32`.
- `MCP_OAUTH_ISSUER` – public origin of this MCP server, e.g. `https://meals-mcp.example.com`. Used as the OAuth issuer in tokens and discovery metadata.
- `MCP_OAUTH_SIGNING_SECRET` – HMAC secret used to sign JWT access tokens. Generate with `openssl rand -base64 64`.
- `MCP_OAUTH_LOGIN_URL` – public URL of the meals web app's login page. Unauthenticated `/oauth/authorize` requests are redirected here with `?callbackUrl=…`.

Optional:

- `MCP_OAUTH_ACCESS_TOKEN_TTL` – access token lifetime in seconds. Default: `3600` (1 hour).
- `MCP_OAUTH_REFRESH_TOKEN_TTL` – refresh token lifetime in seconds. Default: `2592000` (30 days).
- `PORT` – port to expose the MCP server. Default: `5050`.
- `MCP_ALLOWED_HOSTS` – comma-separated list of `Host` headers accepted by the server (DNS rebinding protection).
- `MCP_ENABLE_ADMIN_TOOLS` – set to `true` to offer the `admin-*` tools to administrators. Default: `false`. Any other value than `true`/`false`/`1`/`0` stops the server at startup rather than being guessed at.
- `MCP_TIMEZONE` – IANA time zone that decides what "today" and "this week" mean. Default: `Europe/Oslo`.

## OAuth flow overview

The MCP server hosts a complete OAuth 2.1 authorization server with PKCE and Dynamic Client Registration:

| Endpoint                                          | Purpose                                  |
| ------------------------------------------------- | ---------------------------------------- |
| `GET /.well-known/oauth-authorization-server`     | RFC 8414 metadata (auth + token URLs)    |
| `GET /.well-known/oauth-protected-resource`       | RFC 9728 resource metadata               |
| `POST /oauth/register`                            | RFC 7591 Dynamic Client Registration     |
| `GET /oauth/authorize`                            | Authorization endpoint (PKCE S256 only)  |
| `POST /oauth/authorize/decision`                  | Consent form submission (approve/deny)   |
| `POST /oauth/token`                               | Token endpoint (`authorization_code`, `refresh_token`) |
| `POST /mcp`                                       | Protected MCP endpoint (`Authorization: Bearer <jwt>`) |

When a client hits `/oauth/authorize` without a valid better-auth session cookie, the server redirects to `MCP_OAUTH_LOGIN_URL?callbackUrl=…`. The web app's login page authenticates the user (magic link or OTP via better-auth) and sends them back to `/oauth/authorize`. Because client registration is open (DCR), the server then shows an explicit consent page before issuing an authorization code — otherwise any registered client could obtain a code for a logged-in user via a single crafted link. Approvals are remembered per user + client, so subsequent authorizations for the same client skip the consent screen. Token exchange validates PKCE and returns a JWT access token plus a rotating opaque refresh token.

`POST /mcp` is stateless Streamable HTTP: every request is self-contained (no session id) and is answered with a single JSON body rather than an SSE stream, so nothing is lost when a container restarts or a proxy buffers the response.

### State persistence

Registered clients, authorization codes, refresh tokens, and consent decisions live in Postgres (`DATABASE_URL`), not in process memory. That matters for two failure modes that otherwise show up within days:

- A client such as ChatGPT caches the `client_id` it got from Dynamic Client Registration. If the registration is gone after a restart, re-authorizing fails with `invalid_client: Unknown client_id` and the only way out is deleting and re-adding the connector.
- Refresh tokens that vanish on restart log every connected client out, regardless of `MCP_OAUTH_REFRESH_TOKEN_TTL`.

Refresh tokens rotate on every use, and the old token keeps working for 60 seconds after rotation. Within that window it returns the *same* replacement token instead of a new one, so a client whose rotation response was lost — or two refreshes racing — recovers instead of losing its session. After the window, reuse is rejected as normal. Expired rows are swept every 15 minutes; registrations that were never connected through are dropped after 24 hours.

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

- Week plans, the shopping list, the extra item catalog, packages, stores and the freezer are scoped to the user's active household — `BOOTSTRAP_HOUSEHOLD_NAME` is only used as a tie-breaker when the user is in multiple households.
- Recipes and ingredients are global (not household-scoped) – any change is visible to every household.
- Shopping settings belong to the user.
- Access follows the allowlist: when an address is removed (in the web app or with `admin-remove-allowed-email`), the API rejects calls made on that user's behalf from that moment, and their refresh tokens are deleted, so connected clients cannot renew.
- The `admin-*` tools act across all households — see below.

### Admin tools

The `admin-*` tools can lock people out, change who is an administrator and delete a household with everything in it, and an MCP client acts on a model's reading of a conversation. They are therefore behind a server-wide switch that is off by default:

- **`MCP_ENABLE_ADMIN_TOOLS` unset or `false`:** the tools are not registered for anyone. They are absent from `tools/list`, calling one by name fails with "tool not found", and the server instructions do not mention them. Administrators keep every other tool.
- **`MCP_ENABLE_ADMIN_TOOLS=true`:** the tools are registered for users whose role is `ADMIN`, and nobody else. The role is looked up through the API and cached for a minute, so a role change shows up in the tool list after at most that long.

The switch is read at startup, so changing it means restarting the container (with the new environment — `docker compose up -d meals-mcp`, not just a restart). The startup log states which mode is active. A sensible way to use it is to leave it off, turn it on for the session where you need it, and turn it off again; everything the tools do is also available in the web app's admin page.

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

## Tests

```bash
pnpm --filter mcp-server test
```

- `test/tools.test.ts` drives the tools through the SDK's in-memory client against a fake API, so each test states exactly which API calls a tool makes.
- `test/app.test.ts` covers the HTTP endpoint (auth, role-based tool list, host allowlist) and checks that every API procedure is reachable through a tool.
- The OAuth provider (PKCE, JWT signing/verification, token stores, and the full authorize → consent → token flow) runs against an embedded Postgres.

To poke at a running server by hand, use the MCP Inspector: `pnpm mcp:inspect`, then connect to `http://localhost:5050/mcp`.
