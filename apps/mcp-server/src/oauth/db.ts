import { prisma as sharedPrisma, type PrismaClient } from "@repo/database";

/**
 * Persistent storage for the OAuth provider state.
 *
 * This state used to live in module-level Maps, which meant every deploy or
 * container restart wiped it:
 *
 * - Registered clients disappeared, so a client that had cached its
 *   `client_id` (ChatGPT does) got `invalid_client: Unknown client_id` when
 *   it tried to re-authorize, with no way to recover except forgetting the
 *   connector entirely.
 * - Refresh tokens disappeared, so every connected client was logged out
 *   after a few days regardless of the 30-day refresh TTL.
 *
 * Everything now lives in Postgres (same instance as meals-api), so
 * connections survive restarts and only expire when their TTL actually runs
 * out.
 */

export interface OAuthClientRow {
  clientId: string;
  name: string | null;
  redirectUris: string[];
  createdAt: Date;
}

export interface OAuthAuthorizationCodeRow {
  code: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string | null;
  codeChallenge: string;
  codeChallengeMethod: string;
  expiresAt: Date;
}

export interface OAuthPendingApprovalRow {
  token: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string | null;
  state: string | null;
  codeChallenge: string;
  codeChallengeMethod: string;
  expiresAt: Date;
}

/**
 * Outcome of presenting a refresh token at the token endpoint.
 *
 * - `rotated`: the token was valid and has been swapped for `refreshToken`.
 * - `replayed`: the token was already rotated, but recently enough that this
 *   is almost certainly a retry of a request whose response never arrived
 *   (or two refreshes racing). The replacement issued at the time is handed
 *   back so the client stays connected. See REFRESH_REPLAY_GRACE_MS.
 * - `client_mismatch`: the token belongs to a different client. Not
 *   consumed — a wrong `client_id` must not cost the user their session.
 * - `invalid`: unknown, expired, or rotated too long ago to be a retry.
 */
export type RefreshRotationResult =
  | {
      kind: "rotated" | "replayed";
      clientId: string;
      userId: string;
      scope: string | null;
      refreshToken: string;
    }
  | { kind: "client_mismatch" }
  | { kind: "invalid" };

// How long a just-rotated refresh token keeps working as a retry key. Long
// enough to cover a dropped response or two concurrent refreshes, short
// enough that a leaked token is not broadly reusable.
const REFRESH_REPLAY_GRACE_MS = 60 * 1000;

// Rotated tokens are kept this long so the grace window above can find them,
// then pruned.
const REVOKED_RETENTION_MS = 60 * 60 * 1000;

// Registration is unauthenticated (RFC 7591), so cap the number of stored
// clients to keep a registration flood from filling the table. Only clients
// nobody is actually using are evicted (see makeRoomForClient).
let maxClients = 1000;

// An unused registration older than this is garbage from an abandoned or
// hostile registration attempt.
const UNUSED_CLIENT_TTL_MS = 24 * 60 * 60 * 1000;

// Test seam: the suite injects a PGlite-backed client. Production always
// uses the shared client from @repo/database.
let client: PrismaClient = sharedPrisma;

function db(): PrismaClient {
  return client;
}

/**
 * Prisma's "record not found" for a delete/update targeting a missing row.
 * Matched on the error code rather than `instanceof` so it still holds for
 * errors raised by a different Prisma client instance (the tests run
 * against a PGlite-backed one).
 */
function isRecordNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2025"
  );
}

export async function findClient(
  clientId: string,
): Promise<OAuthClientRow | null> {
  const row = await db().oAuthClient.findUnique({ where: { clientId } });
  if (!row) return null;
  return {
    clientId: row.clientId,
    name: row.name,
    redirectUris: row.redirectUris,
    createdAt: row.createdAt,
  };
}

/**
 * Drop registrations that no one is using: no remembered consent, no live
 * refresh token, and nothing in flight. The last part matters because the
 * foreign keys cascade — evicting a client mid-authorization would delete
 * its pending consent request or unconsumed code and break the flow the
 * user is standing in. A real or in-progress connection is therefore never
 * evicted by a registration flood.
 */
async function makeRoomForClient(): Promise<void> {
  const total = await db().oAuthClient.count();
  if (total < maxClients) return;

  const now = new Date();
  const evictable = await db().oAuthClient.findMany({
    where: {
      approvals: { none: {} },
      refreshTokens: { none: { revokedAt: null, expiresAt: { gt: now } } },
      pendingApprovals: { none: { expiresAt: { gt: now } } },
      authorizationCodes: {
        none: { consumedAt: null, expiresAt: { gt: now } },
      },
    },
    orderBy: { createdAt: "asc" },
    take: total - maxClients + 1,
    select: { clientId: true },
  });
  if (evictable.length === 0) return;

  await db().oAuthClient.deleteMany({
    where: { clientId: { in: evictable.map((c) => c.clientId) } },
  });
}

export async function createClient(input: {
  clientId: string;
  name: string | null;
  redirectUris: string[];
}): Promise<OAuthClientRow> {
  await makeRoomForClient();
  const row = await db().oAuthClient.create({
    data: {
      clientId: input.clientId,
      name: input.name,
      redirectUris: input.redirectUris,
    },
  });
  return {
    clientId: row.clientId,
    name: row.name,
    redirectUris: row.redirectUris,
    createdAt: row.createdAt,
  };
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
}): Promise<void> {
  await db().oAuthAuthorizationCode.create({ data: input });
}

/**
 * Atomically consume an authorization code. The guarded `updateMany` is the
 * atomic step: only the caller whose update matched a row (unconsumed and
 * unexpired) gets the code, so a replay — including a concurrent one — comes
 * back null.
 */
export async function consumeAuthorizationCode(
  code: string,
): Promise<OAuthAuthorizationCodeRow | null> {
  const now = new Date();
  const claimed = await db().oAuthAuthorizationCode.updateMany({
    where: { code, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });
  if (claimed.count !== 1) return null;

  const row = await db().oAuthAuthorizationCode.findUnique({ where: { code } });
  if (!row) return null;
  return {
    code: row.code,
    clientId: row.clientId,
    userId: row.userId,
    redirectUri: row.redirectUri,
    scope: row.scope,
    codeChallenge: row.codeChallenge,
    codeChallengeMethod: row.codeChallengeMethod,
    expiresAt: row.expiresAt,
  };
}

export async function createRefreshToken(input: {
  token: string;
  clientId: string;
  userId: string;
  scope: string | null;
  expiresAt: Date;
}): Promise<void> {
  await db().oAuthRefreshToken.create({ data: input });
}

/**
 * Rotate a refresh token: revoke the presented one and issue `newToken` in
 * the same transaction, so the replacement is visible to any concurrent
 * request the moment the revocation is.
 */
export async function rotateRefreshToken(input: {
  token: string;
  clientId: string;
  newToken: string;
  expiresAt: Date;
}): Promise<RefreshRotationResult> {
  const existing = await db().oAuthRefreshToken.findUnique({
    where: { token: input.token },
  });
  if (!existing) return { kind: "invalid" };
  if (existing.clientId !== input.clientId) return { kind: "client_mismatch" };

  const now = new Date();
  const rotated = await db().$transaction(async (tx) => {
    const claimed = await tx.oAuthRefreshToken.updateMany({
      where: {
        token: input.token,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { revokedAt: now, replacedByToken: input.newToken },
    });
    if (claimed.count !== 1) return false;

    await tx.oAuthRefreshToken.create({
      data: {
        token: input.newToken,
        clientId: existing.clientId,
        userId: existing.userId,
        scope: existing.scope,
        expiresAt: input.expiresAt,
      },
    });
    return true;
  });

  if (rotated) {
    return {
      kind: "rotated",
      clientId: existing.clientId,
      userId: existing.userId,
      scope: existing.scope,
      refreshToken: input.newToken,
    };
  }

  // Lost the race (or a retry): re-read to see whether this token was
  // rotated just now, and if so hand back the replacement it produced.
  const current = await db().oAuthRefreshToken.findUnique({
    where: { token: input.token },
  });
  if (!current?.revokedAt || !current.replacedByToken)
    return { kind: "invalid" };
  if (now.getTime() - current.revokedAt.getTime() > REFRESH_REPLAY_GRACE_MS) {
    return { kind: "invalid" };
  }

  const replacement = await db().oAuthRefreshToken.findUnique({
    where: { token: current.replacedByToken },
  });
  if (
    !replacement ||
    replacement.revokedAt !== null ||
    replacement.expiresAt.getTime() <= now.getTime()
  ) {
    return { kind: "invalid" };
  }

  return {
    kind: "replayed",
    clientId: replacement.clientId,
    userId: replacement.userId,
    scope: replacement.scope,
    refreshToken: replacement.token,
  };
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
}): Promise<void> {
  await db().oAuthPendingApproval.create({ data: input });
}

/**
 * Atomically consume a pending consent request. Single-use: the row is
 * deleted whether or not the caller ends up approving, so a replayed form
 * submission can never issue a second code. `delete` is the atomic step and
 * returns the deleted row, so exactly one concurrent caller can win it; the
 * loser gets P2025 (record not found) and null.
 */
export async function consumePendingApproval(
  token: string,
): Promise<OAuthPendingApprovalRow | null> {
  let row;
  try {
    row = await db().oAuthPendingApproval.delete({ where: { token } });
  } catch (error) {
    // Only "no such row" means the request was already consumed or never
    // existed. Anything else (connectivity, permissions, schema) must
    // surface as a 500 rather than masquerade as an expired consent.
    if (!isRecordNotFound(error)) throw error;
    return null;
  }
  if (row.expiresAt.getTime() <= Date.now()) return null;
  return {
    token: row.token,
    clientId: row.clientId,
    userId: row.userId,
    redirectUri: row.redirectUri,
    scope: row.scope,
    state: row.state,
    codeChallenge: row.codeChallenge,
    codeChallengeMethod: row.codeChallengeMethod,
    expiresAt: row.expiresAt,
  };
}

export async function rememberApproval(
  userId: string,
  clientId: string,
): Promise<void> {
  await db().oAuthClientApproval.upsert({
    where: { userId_clientId: { userId, clientId } },
    create: { userId, clientId },
    update: {},
  });
}

export async function hasApproval(
  userId: string,
  clientId: string,
): Promise<boolean> {
  const row = await db().oAuthClientApproval.findUnique({
    where: { userId_clientId: { userId, clientId } },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Delete rows that can no longer be used: expired authorization codes and
 * pending consent requests, refresh tokens that expired or were rotated
 * long enough ago that the replay window is gone, and registrations that
 * were never connected through.
 */
export async function pruneExpired(): Promise<void> {
  const now = new Date();
  await db().oAuthAuthorizationCode.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  await db().oAuthPendingApproval.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  await db().oAuthRefreshToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: now } },
        { revokedAt: { lt: new Date(now.getTime() - REVOKED_RETENTION_MS) } },
      ],
    },
  });
  await db().oAuthClient.deleteMany({
    where: {
      createdAt: { lt: new Date(now.getTime() - UNUSED_CLIENT_TTL_MS) },
      approvals: { none: {} },
      refreshTokens: { none: {} },
      authorizationCodes: { none: {} },
      pendingApprovals: { none: {} },
    },
  });
}

export const __internal = {
  REFRESH_REPLAY_GRACE_MS,
  REVOKED_RETENTION_MS,
  UNUSED_CLIENT_TTL_MS,
  setPrismaClient(next: PrismaClient) {
    client = next;
  },
  /** Lets the eviction tests reach the cap without inserting 1000 rows. */
  setMaxClients(next: number) {
    maxClients = next;
  },
};
