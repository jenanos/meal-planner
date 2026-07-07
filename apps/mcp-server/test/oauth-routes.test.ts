import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { registerOAuthRoutes, type OAuthConfig } from "../src/oauth/routes";
import { verifyAccessToken } from "../src/oauth/jwt";
import * as db from "../src/oauth/db";

const ISSUER = "https://mcp.test";
const LOGIN_URL = "https://meals.test/login";
const SIGNING_SECRET = "test-signing-secret";

// Fake meals-api: /auth/get-session resolves the user from the cookie so
// tests can act as different (or no) logged-in users.
const SESSION_USERS: Record<string, { id: string; email: string }> = {
  "session=user-1": { id: "user-1", email: "user1@example.com" },
  "session=user-2": { id: "user-2", email: "user2@example.com" },
};

let fakeApi: Server;
let mcp: Server;
let mcpOrigin: string;

beforeAll(async () => {
  fakeApi = createServer((req, res) => {
    if (req.url?.startsWith("/auth/get-session")) {
      const user = SESSION_USERS[req.headers.cookie ?? ""] ?? null;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(user ? { user } : {}));
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((resolve) => fakeApi.listen(0, resolve));
  const apiOrigin = `http://127.0.0.1:${(fakeApi.address() as AddressInfo).port}`;

  const config: OAuthConfig = {
    issuer: ISSUER,
    signingSecret: SIGNING_SECRET,
    apiOrigin,
    loginUrl: LOGIN_URL,
    accessTokenTtl: 3600,
    refreshTokenTtl: 3600 * 24,
  };

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));
  registerOAuthRoutes(app, config);

  mcp = createServer(app);
  await new Promise<void>((resolve) => mcp.listen(0, resolve));
  mcpOrigin = `http://127.0.0.1:${(mcp.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => mcp.close(resolve));
  await new Promise((resolve) => fakeApi.close(resolve));
});

beforeEach(() => {
  db.__internal.reset();
});

function makePkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function registerClient(redirectUri = "https://client.test/cb") {
  const res = await fetch(`${mcpOrigin}/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Test Client",
      redirect_uris: [redirectUri],
    }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { client_id: string };
}

function authorizeUrl(params: Record<string, string>) {
  const u = new URL(`${mcpOrigin}/oauth/authorize`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

async function authorize(
  clientId: string,
  challenge: string,
  cookie?: string,
  redirectUri = "https://client.test/cb",
) {
  return fetch(
    authorizeUrl({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "mcp",
      state: "state-123",
      code_challenge: challenge,
      code_challenge_method: "S256",
    }),
    { redirect: "manual", headers: cookie ? { cookie } : {} },
  );
}

function extractRequestToken(html: string): string {
  const match = html.match(/name="request_token" value="([^"]+)"/);
  expect(match).not.toBeNull();
  return match![1];
}

async function submitDecision(
  requestToken: string,
  decision: "approve" | "deny",
  cookie?: string,
) {
  return fetch(`${mcpOrigin}/oauth/authorize/decision`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...(cookie ? { cookie } : {}),
    },
    body: new URLSearchParams({ request_token: requestToken, decision }),
  });
}

async function fullAuthorization(cookie = "session=user-1") {
  const { client_id } = await registerClient();
  const { verifier, challenge } = makePkce();

  const consentRes = await authorize(client_id, challenge, cookie);
  expect(consentRes.status).toBe(200);
  const requestToken = extractRequestToken(await consentRes.text());

  const decisionRes = await submitDecision(requestToken, "approve", cookie);
  expect(decisionRes.status).toBe(302);
  const location = new URL(decisionRes.headers.get("location")!);
  const code = location.searchParams.get("code")!;
  expect(code).toBeTruthy();
  expect(location.searchParams.get("state")).toBe("state-123");

  return { client_id, verifier, code };
}

async function exchangeCode(clientId: string, code: string, verifier: string) {
  return fetch(`${mcpOrigin}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      redirect_uri: "https://client.test/cb",
      code_verifier: verifier,
    }),
  });
}

describe("discovery metadata", () => {
  it("serves RFC 8414 authorization server metadata", async () => {
    const res = await fetch(
      `${mcpOrigin}/.well-known/oauth-authorization-server`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.issuer).toBe(ISSUER);
    expect(body.code_challenge_methods_supported).toEqual(["S256"]);
    expect(body.registration_endpoint).toBe(`${ISSUER}/oauth/register`);
  });

  it("serves RFC 9728 protected resource metadata", async () => {
    const res = await fetch(
      `${mcpOrigin}/.well-known/oauth-protected-resource`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authorization_servers).toEqual([ISSUER]);
  });
});

describe("dynamic client registration", () => {
  it("registers a client with valid redirect URIs", async () => {
    const { client_id } = await registerClient();
    expect(client_id).toBeTruthy();
  });

  it("rejects non-HTTPS redirect URIs", async () => {
    const res = await fetch(`${mcpOrigin}/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: ["http://evil.test/cb"] }),
    });
    expect(res.status).toBe(400);
  });

  it("allows http://localhost redirect URIs for development", async () => {
    const res = await fetch(`${mcpOrigin}/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: ["http://localhost:3000/cb"] }),
    });
    expect(res.status).toBe(201);
  });

  it("rejects registrations with too many redirect URIs", async () => {
    const uris = Array.from(
      { length: 11 },
      (_, i) => `https://client.test/cb${i}`,
    );
    const res = await fetch(`${mcpOrigin}/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: uris }),
    });
    expect(res.status).toBe(400);
  });
});

describe("authorization + consent", () => {
  it("redirects unauthenticated users to the login page", async () => {
    const { client_id } = await registerClient();
    const { challenge } = makePkce();
    const res = await authorize(client_id, challenge);
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(`${location.origin}${location.pathname}`).toBe(LOGIN_URL);
    expect(location.searchParams.get("callbackUrl")).toContain(
      "/oauth/authorize",
    );
  });

  it("shows a consent page instead of silently issuing a code", async () => {
    const { client_id } = await registerClient();
    const { challenge } = makePkce();
    const res = await authorize(client_id, challenge, "session=user-1");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Test Client");
    expect(html).toContain("request_token");
  });

  it("rejects an unregistered redirect_uri without redirecting", async () => {
    const { client_id } = await registerClient();
    const { challenge } = makePkce();
    const res = await authorize(
      client_id,
      challenge,
      "session=user-1",
      "https://evil.test/cb",
    );
    expect(res.status).toBe(400);
  });

  it("requires a PKCE challenge", async () => {
    const { client_id } = await registerClient();
    const res = await fetch(
      authorizeUrl({
        response_type: "code",
        client_id,
        redirect_uri: "https://client.test/cb",
      }),
      { redirect: "manual", headers: { cookie: "session=user-1" } },
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("error")).toBe("invalid_request");
  });

  it("issues a code after explicit approval and completes token exchange", async () => {
    const { client_id, verifier, code } = await fullAuthorization();

    const tokenRes = await exchangeCode(client_id, code, verifier);
    expect(tokenRes.status).toBe(200);
    const body = await tokenRes.json();
    expect(body.token_type).toBe("Bearer");
    expect(body.refresh_token).toBeTruthy();

    const claims = verifyAccessToken(
      body.access_token,
      SIGNING_SECRET,
      ISSUER,
      ISSUER,
    );
    expect(claims?.sub).toBe("user-1");
    expect(claims?.client_id).toBe(client_id);
  });

  it("redirects with access_denied when the user denies", async () => {
    const { client_id } = await registerClient();
    const { challenge } = makePkce();
    const consentRes = await authorize(client_id, challenge, "session=user-1");
    const requestToken = extractRequestToken(await consentRes.text());

    const res = await submitDecision(requestToken, "deny", "session=user-1");
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("code")).toBeNull();
  });

  it("rejects a decision from a different user's session", async () => {
    const { client_id } = await registerClient();
    const { challenge } = makePkce();
    const consentRes = await authorize(client_id, challenge, "session=user-1");
    const requestToken = extractRequestToken(await consentRes.text());

    const res = await submitDecision(requestToken, "approve", "session=user-2");
    expect(res.status).toBe(403);
  });

  it("rejects a decision without a session", async () => {
    const { client_id } = await registerClient();
    const { challenge } = makePkce();
    const consentRes = await authorize(client_id, challenge, "session=user-1");
    const requestToken = extractRequestToken(await consentRes.text());

    const res = await submitDecision(requestToken, "approve");
    expect(res.status).toBe(403);
  });

  it("does not allow the consent form to be replayed", async () => {
    const { client_id } = await registerClient();
    const { challenge } = makePkce();
    const consentRes = await authorize(client_id, challenge, "session=user-1");
    const requestToken = extractRequestToken(await consentRes.text());

    const first = await submitDecision(requestToken, "approve", "session=user-1");
    expect(first.status).toBe(302);
    const second = await submitDecision(requestToken, "approve", "session=user-1");
    expect(second.status).toBe(400);
  });

  it("skips consent for a client the user already approved", async () => {
    const { client_id } = await fullAuthorization();

    const { challenge } = makePkce();
    const res = await authorize(client_id, challenge, "session=user-1");
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("code")).toBeTruthy();
  });

  it("still shows consent to a different user for the same client", async () => {
    const { client_id } = await fullAuthorization("session=user-1");

    const { challenge } = makePkce();
    const res = await authorize(client_id, challenge, "session=user-2");
    expect(res.status).toBe(200);
  });
});

describe("token endpoint", () => {
  it("rejects a wrong PKCE verifier", async () => {
    const { client_id, code } = await fullAuthorization();
    const res = await exchangeCode(
      client_id,
      code,
      randomBytes(32).toString("base64url"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_grant");
  });

  it("rejects code reuse", async () => {
    const { client_id, verifier, code } = await fullAuthorization();
    expect((await exchangeCode(client_id, code, verifier)).status).toBe(200);
    expect((await exchangeCode(client_id, code, verifier)).status).toBe(400);
  });

  it("rejects a code exchanged by a different client", async () => {
    const { verifier, code } = await fullAuthorization();
    const other = await registerClient();
    const res = await exchangeCode(other.client_id, code, verifier);
    expect(res.status).toBe(400);
  });

  it("rotates refresh tokens and rejects reuse of the old one", async () => {
    const { client_id, verifier, code } = await fullAuthorization();
    const tokenBody = await (await exchangeCode(client_id, code, verifier)).json();

    const refresh = (refreshToken: string) =>
      fetch(`${mcpOrigin}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id,
        }),
      });

    const first = await refresh(tokenBody.refresh_token);
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.refresh_token).not.toBe(tokenBody.refresh_token);
    expect(
      verifyAccessToken(firstBody.access_token, SIGNING_SECRET, ISSUER, ISSUER)
        ?.sub,
    ).toBe("user-1");

    const replay = await refresh(tokenBody.refresh_token);
    expect(replay.status).toBe(400);
  });

  it("rejects unsupported grant types", async () => {
    const res = await fetch(`${mcpOrigin}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("unsupported_grant_type");
  });
});
