import { describe, it, expect, beforeEach } from "vitest";
import * as db from "../src/oauth/db";

const future = () => new Date(Date.now() + 60_000);
const past = () => new Date(Date.now() - 60_000);

beforeEach(() => {
  db.__internal.reset();
});

describe("authorization codes", () => {
  it("consumes a valid code exactly once", async () => {
    await db.createAuthorizationCode({
      code: "code-1",
      clientId: "client-1",
      userId: "user-1",
      redirectUri: "https://client.example/cb",
      scope: "mcp",
      codeChallenge: "challenge",
      codeChallengeMethod: "S256",
      expiresAt: future(),
    });

    const first = await db.consumeAuthorizationCode("code-1");
    expect(first?.userId).toBe("user-1");

    const second = await db.consumeAuthorizationCode("code-1");
    expect(second).toBeNull();
  });

  it("rejects expired codes", async () => {
    await db.createAuthorizationCode({
      code: "code-2",
      clientId: "client-1",
      userId: "user-1",
      redirectUri: "https://client.example/cb",
      scope: null,
      codeChallenge: "challenge",
      codeChallengeMethod: "S256",
      expiresAt: past(),
    });
    expect(await db.consumeAuthorizationCode("code-2")).toBeNull();
  });

  it("rejects unknown codes", async () => {
    expect(await db.consumeAuthorizationCode("nope")).toBeNull();
  });
});

describe("refresh tokens", () => {
  it("consumes a valid token exactly once (rotation)", async () => {
    await db.createRefreshToken({
      token: "rt-1",
      clientId: "client-1",
      userId: "user-1",
      scope: "mcp",
      expiresAt: future(),
    });

    const first = await db.consumeRefreshToken("rt-1");
    expect(first?.userId).toBe("user-1");
    expect(await db.consumeRefreshToken("rt-1")).toBeNull();
  });

  it("rejects expired tokens", async () => {
    await db.createRefreshToken({
      token: "rt-2",
      clientId: "client-1",
      userId: "user-1",
      scope: null,
      expiresAt: past(),
    });
    expect(await db.consumeRefreshToken("rt-2")).toBeNull();
  });
});

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
  it("tracks per user+client", async () => {
    expect(await db.hasApproval("user-1", "client-1")).toBe(false);
    await db.rememberApproval("user-1", "client-1");
    expect(await db.hasApproval("user-1", "client-1")).toBe(true);
    expect(await db.hasApproval("user-2", "client-1")).toBe(false);
    expect(await db.hasApproval("user-1", "client-2")).toBe(false);
  });
});

describe("client registration cap", () => {
  it("evicts the oldest client when the cap is reached", async () => {
    const max = db.__internal.MAX_CLIENTS;
    for (let i = 0; i < max; i++) {
      await db.createClient({
        clientId: `client-${i}`,
        name: null,
        redirectUris: ["https://client.example/cb"],
      });
    }
    expect(db.__internal.clients.size).toBe(max);
    expect(await db.findClient("client-0")).not.toBeNull();

    await db.createClient({
      clientId: "client-overflow",
      name: null,
      redirectUris: ["https://client.example/cb"],
    });

    expect(db.__internal.clients.size).toBe(max);
    expect(await db.findClient("client-0")).toBeNull();
    expect(await db.findClient("client-overflow")).not.toBeNull();
  });
});
