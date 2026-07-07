import { randomBytes } from "node:crypto";

/**
 * In-memory storage for the OAuth provider state. Trade-offs:
 *
 * - Auth codes have a 10-minute TTL anyway, so a restart mid-auth just
 *   makes the user redo the bounce.
 * - Client registrations are lost on restart, but ChatGPT (and any other
 *   OAuth client that uses Dynamic Client Registration) will simply
 *   re-register via /oauth/register, so the flow is self-healing.
 * - Refresh tokens are lost on restart, so connected clients have to
 *   re-authorize. Acceptable for a personal MCP server; revisit if this
 *   needs to survive deploys.
 *
 * Going in-memory keeps the MCP server free of the @repo/database dep,
 * which avoids a workspace lockfile churn for what amounts to a few
 * short-lived rows.
 */

interface OAuthClientRow {
  clientId: string;
  name: string | null;
  redirectUris: string[];
  createdAt: Date;
}

interface OAuthAuthorizationCodeRow {
  code: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string | null;
  codeChallenge: string;
  codeChallengeMethod: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

interface OAuthRefreshTokenRow {
  token: string;
  clientId: string;
  userId: string;
  scope: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

interface OAuthPendingApprovalRow {
  token: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string | null;
  state: string | null;
  codeChallenge: string;
  codeChallengeMethod: string;
  expiresAt: Date;
  createdAt: Date;
}

const clients = new Map<string, OAuthClientRow>();
const authorizationCodes = new Map<string, OAuthAuthorizationCodeRow>();
const refreshTokens = new Map<string, OAuthRefreshTokenRow>();
const pendingApprovals = new Map<string, OAuthPendingApprovalRow>();
// Remembered consent decisions, keyed `${userId}::${clientId}`. Lets a
// user skip the consent screen for clients they already approved in this
// process lifetime.
const approvedClients = new Set<string>();

// Registration is unauthenticated (RFC 7591), so cap the number of stored
// clients to keep a registration flood from exhausting memory. Map
// iteration order is insertion order, so evicting the first key drops the
// oldest registration.
const MAX_CLIENTS = 1000;

// Periodically prune expired rows so the maps don't grow unbounded.
const PRUNE_INTERVAL_MS = 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [code, row] of authorizationCodes) {
    if (row.expiresAt.getTime() < now) authorizationCodes.delete(code);
  }
  for (const [token, row] of refreshTokens) {
    if (row.expiresAt.getTime() < now) refreshTokens.delete(token);
  }
  for (const [token, row] of pendingApprovals) {
    if (row.expiresAt.getTime() < now) pendingApprovals.delete(token);
  }
}, PRUNE_INTERVAL_MS).unref();

export async function findClient(clientId: string): Promise<OAuthClientRow | null> {
  return clients.get(clientId) ?? null;
}

export async function createClient(input: {
  clientId: string;
  name: string | null;
  redirectUris: string[];
}): Promise<OAuthClientRow> {
  while (clients.size >= MAX_CLIENTS) {
    const oldest = clients.keys().next().value;
    if (oldest === undefined) break;
    clients.delete(oldest);
  }
  const row: OAuthClientRow = {
    clientId: input.clientId,
    name: input.name,
    redirectUris: [...input.redirectUris],
    createdAt: new Date(),
  };
  clients.set(input.clientId, row);
  return row;
}

export async function createAuthorizationCode(input: {
  code: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string | null;
  codeChallenge: string;
  codeChallengeMethod: string;
  expiresAt: Date;
}): Promise<OAuthAuthorizationCodeRow> {
  const row: OAuthAuthorizationCodeRow = {
    ...input,
    consumedAt: null,
    createdAt: new Date(),
  };
  authorizationCodes.set(input.code, row);
  return row;
}

/**
 * Atomically consume an authorization code. Only succeeds if the code
 * exists, has not been consumed, and has not expired. JS is
 * single-threaded so the read-and-mutate sequence here is effectively
 * atomic for in-process state.
 */
export async function consumeAuthorizationCode(
  code: string,
): Promise<OAuthAuthorizationCodeRow | null> {
  const row = authorizationCodes.get(code);
  if (!row) return null;
  if (row.consumedAt !== null) return null;
  if (row.expiresAt.getTime() <= Date.now()) {
    authorizationCodes.delete(code);
    return null;
  }
  row.consumedAt = new Date();
  return row;
}

export async function createRefreshToken(input: {
  token: string;
  clientId: string;
  userId: string;
  scope: string | null;
  expiresAt: Date;
}): Promise<OAuthRefreshTokenRow> {
  const row: OAuthRefreshTokenRow = {
    ...input,
    revokedAt: null,
    createdAt: new Date(),
  };
  refreshTokens.set(input.token, row);
  return row;
}

/**
 * Atomically consume a refresh token for rotation. Only succeeds if the
 * token exists, has not been revoked, and has not expired. Returns the
 * row so the caller can mint a new token bound to the same user/client.
 */
export async function consumeRefreshToken(
  token: string,
): Promise<OAuthRefreshTokenRow | null> {
  const row = refreshTokens.get(token);
  if (!row) return null;
  if (row.revokedAt !== null) return null;
  if (row.expiresAt.getTime() <= Date.now()) {
    refreshTokens.delete(token);
    return null;
  }
  row.revokedAt = new Date();
  return row;
}

export async function createPendingApproval(input: {
  token: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string | null;
  state: string | null;
  codeChallenge: string;
  codeChallengeMethod: string;
  expiresAt: Date;
}): Promise<OAuthPendingApprovalRow> {
  const row: OAuthPendingApprovalRow = {
    ...input,
    createdAt: new Date(),
  };
  pendingApprovals.set(input.token, row);
  return row;
}

/**
 * Atomically consume a pending consent request. Single-use: the row is
 * deleted whether or not the caller ends up approving, so a replayed
 * form submission can never issue a second code.
 */
export async function consumePendingApproval(
  token: string,
): Promise<OAuthPendingApprovalRow | null> {
  const row = pendingApprovals.get(token);
  if (!row) return null;
  pendingApprovals.delete(token);
  if (row.expiresAt.getTime() <= Date.now()) return null;
  return row;
}

export async function rememberApproval(
  userId: string,
  clientId: string,
): Promise<void> {
  approvedClients.add(`${userId}::${clientId}`);
}

export async function hasApproval(
  userId: string,
  clientId: string,
): Promise<boolean> {
  return approvedClients.has(`${userId}::${clientId}`);
}

// Re-exported for tests that want to seed or inspect state directly.
export const __internal = {
  clients,
  authorizationCodes,
  refreshTokens,
  pendingApprovals,
  approvedClients,
  MAX_CLIENTS,
  reset() {
    clients.clear();
    authorizationCodes.clear();
    refreshTokens.clear();
    pendingApprovals.clear();
    approvedClients.clear();
  },
  generateOpaqueToken: (byteLength = 32) =>
    randomBytes(byteLength).toString("base64url"),
};
