import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { PrismaClient } from "@repo/database";
import * as db from "../src/oauth/db";
import {
  resetOAuthTestDb,
  seedClient,
  setupOAuthTestDb,
  teardownOAuthTestDb,
} from "./helpers/oauth-db";

const future = () => new Date(Date.now() + 60_000);
const past = () => new Date(Date.now() - 60_000);

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupOAuthTestDb();
}, 60_000);

afterAll(async () => {
  await teardownOAuthTestDb();
});

beforeEach(async () => {
  await resetOAuthTestDb();
  await seedClient("client-1");
  await seedClient("client-2");
});

describe("clients", () => {
  it("survives as a stored row, so a restart keeps client_id valid", async () => {
    await db.createClient({
      clientId: "client-3",
      name: "ChatGPT",
      redirectUris: ["https://chat.example/cb"],
    });

    const found = await db.findClient("client-3");
    expect(found?.name).toBe("ChatGPT");
    expect(found?.redirectUris).toEqual(["https://chat.example/cb"]);
  });

  it("returns null for unknown clients", async () => {
    expect(await db.findClient("nope")).toBeNull();
  });
});

describe("authorization codes", () => {
  const codeInput = (code: string, expiresAt: Date) => ({
    code,
    clientId: "client-1",
    userId: "user-1",
    redirectUri: "https://client.example/cb",
    scope: "mcp",
    codeChallenge: "challenge",
    codeChallengeMethod: "S256",
    expiresAt,
  });

  it("consumes a valid code exactly once", async () => {
    await db.createAuthorizationCode(codeInput("code-1", future()));

    const first = await db.consumeAuthorizationCode("code-1");
    expect(first?.userId).toBe("user-1");

    const second = await db.consumeAuthorizationCode("code-1");
    expect(second).toBeNull();
  });

  it("lets only one of two concurrent consumers win", async () => {
    await db.createAuthorizationCode(codeInput("code-race", future()));

    const results = await Promise.all([
      db.consumeAuthorizationCode("code-race"),
      db.consumeAuthorizationCode("code-race"),
    ]);
    expect(results.filter((r) => r !== null)).toHaveLength(1);
  });

  it("rejects expired codes", async () => {
    await db.createAuthorizationCode(codeInput("code-2", past()));
    expect(await db.consumeAuthorizationCode("code-2")).toBeNull();
  });

  it("rejects unknown codes", async () => {
    expect(await db.consumeAuthorizationCode("nope")).toBeNull();
  });
});

describe("refresh token rotation", () => {
  const rotate = (token: string, newToken: string, clientId = "client-1") =>
    db.rotateRefreshToken({
      token,
      clientId,
      newToken,
      expiresAt: future(),
    });

  const issue = (token: string, expiresAt = future(), clientId = "client-1") =>
    db.createRefreshToken({
      token,
      clientId,
      userId: "user-1",
      scope: "mcp",
      expiresAt,
    });

  it("swaps a valid token for a new one", async () => {
    await issue("rt-1");
    const result = await rotate("rt-1", "rt-2");
    expect(result).toMatchObject({
      kind: "rotated",
      userId: "user-1",
      clientId: "client-1",
      scope: "mcp",
      refreshToken: "rt-2",
    });

    // The replacement works; the old one no longer rotates again.
    expect((await rotate("rt-2", "rt-3")).kind).toBe("rotated");
  });

  it("returns the same replacement when the old token is retried inside the grace window", async () => {
    await issue("rt-grace");
    const first = await rotate("rt-grace", "rt-grace-new");
    expect(first.kind).toBe("rotated");

    // A client that never received the response retries with the old token.
    const retry = await rotate("rt-grace", "rt-grace-other");
    expect(retry).toMatchObject({
      kind: "replayed",
      refreshToken: "rt-grace-new",
      userId: "user-1",
    });
  });

  it("keeps both racing refreshes connected", async () => {
    await issue("rt-race");
    const [a, b] = await Promise.all([
      rotate("rt-race", "rt-race-a"),
      rotate("rt-race", "rt-race-b"),
    ]);

    const kinds = [a.kind, b.kind].sort();
    expect(kinds).toEqual(["replayed", "rotated"]);
    // Both callers end up holding the one token that was actually issued.
    expect(a).toHaveProperty("refreshToken");
    expect(b).toHaveProperty("refreshToken");
    expect((a as { refreshToken: string }).refreshToken).toBe(
      (b as { refreshToken: string }).refreshToken,
    );
  });

  it("rejects a replay once the grace window has passed", async () => {
    await issue("rt-old");
    await rotate("rt-old", "rt-old-new");

    await expireReplayGrace("rt-old");

    expect((await rotate("rt-old", "rt-old-again")).kind).toBe("invalid");
  });

  it("rejects expired tokens", async () => {
    await issue("rt-expired", past());
    expect((await rotate("rt-expired", "rt-expired-new")).kind).toBe("invalid");
  });

  it("rejects unknown tokens", async () => {
    expect((await rotate("nope", "nope-new")).kind).toBe("invalid");
  });

  it("does not consume the token when the client_id does not match", async () => {
    await issue("rt-mismatch");
    expect((await rotate("rt-mismatch", "x", "client-2")).kind).toBe(
      "client_mismatch",
    );
    // Still usable by its real client — a wrong client_id must not log the
    // user out.
    expect((await rotate("rt-mismatch", "rt-mismatch-new")).kind).toBe("rotated");
  });
});

/** Backdates a token's revokedAt so the replay grace window has lapsed. */
async function expireReplayGrace(token: string): Promise<void> {
  await prisma.oAuthRefreshToken.update({
    where: { token },
    data: {
      revokedAt: new Date(
        Date.now() - db.__internal.REFRESH_REPLAY_GRACE_MS - 1000,
      ),
    },
  });
}

describe("pending approvals", () => {
  const pendingInput = (token: string, expiresAt: Date) => ({
    token,
    clientId: "client-1",
    userId: "user-1",
    redirectUri: "https://client.example/cb",
    scope: "mcp",
    state: "xyz",
    codeChallenge: "challenge",
    codeChallengeMethod: "S256",
    expiresAt,
  });

  it("is single-use", async () => {
    await db.createPendingApproval(pendingInput("pa-1", future()));
    const first = await db.consumePendingApproval("pa-1");
    expect(first?.state).toBe("xyz");
    expect(await db.consumePendingApproval("pa-1")).toBeNull();
  });

  it("rejects expired approvals", async () => {
    await db.createPendingApproval(pendingInput("pa-2", past()));
    expect(await db.consumePendingApproval("pa-2")).toBeNull();
  });
});

describe("remembered approvals", () => {
  it("tracks per user+client and survives repeat approvals", async () => {
    expect(await db.hasApproval("user-1", "client-1")).toBe(false);
    await db.rememberApproval("user-1", "client-1");
    await db.rememberApproval("user-1", "client-1");
    expect(await db.hasApproval("user-1", "client-1")).toBe(true);
    expect(await db.hasApproval("user-2", "client-1")).toBe(false);
    expect(await db.hasApproval("user-1", "client-2")).toBe(false);
  });
});

describe("pruning", () => {
  it("removes expired rows but keeps live ones", async () => {
    await db.createAuthorizationCode({
      code: "code-stale",
      clientId: "client-1",
      userId: "user-1",
      redirectUri: "https://client.example/cb",
      scope: null,
      codeChallenge: "challenge",
      codeChallengeMethod: "S256",
      expiresAt: past(),
    });
    await db.createRefreshToken({
      token: "rt-stale",
      clientId: "client-1",
      userId: "user-1",
      scope: null,
      expiresAt: past(),
    });
    await db.createRefreshToken({
      token: "rt-live",
      clientId: "client-1",
      userId: "user-1",
      scope: null,
      expiresAt: future(),
    });
    await db.createPendingApproval({
      token: "pa-stale",
      clientId: "client-1",
      userId: "user-1",
      redirectUri: "https://client.example/cb",
      scope: null,
      state: null,
      codeChallenge: "challenge",
      codeChallengeMethod: "S256",
      expiresAt: past(),
    });

    await db.pruneExpired();

    expect(await db.consumeAuthorizationCode("code-stale")).toBeNull();
    expect(await db.consumePendingApproval("pa-stale")).toBeNull();
    expect(
      (
        await db.rotateRefreshToken({
          token: "rt-live",
          clientId: "client-1",
          newToken: "rt-live-new",
          expiresAt: future(),
        })
      ).kind,
    ).toBe("rotated");
  });

  it("keeps clients that a user is still connected through", async () => {
    await db.rememberApproval("user-1", "client-1");
    await db.pruneExpired();
    expect(await db.findClient("client-1")).not.toBeNull();
  });
});
