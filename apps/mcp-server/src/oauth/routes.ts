import { randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import { signAccessToken } from "./jwt.js";
import { verifyPkce, type CodeChallengeMethod } from "./pkce.js";
import { getSessionFromCookie } from "./session.js";
import * as db from "./db.js";

export interface OAuthConfig {
  issuer: string; // e.g. https://meals-mcp.jenanos.xyz
  signingSecret: string;
  apiOrigin: string; // internal meals-api origin, used to validate sessions
  loginUrl: string; // public meals-web login URL
  accessTokenTtl: number; // seconds
  refreshTokenTtl: number; // seconds
}

const AUTH_CODE_TTL_SECONDS = 600;

function generateOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

function isAcceptableRedirectUri(value: string): boolean {
  try {
    const u = new URL(value);
    if (u.protocol === "https:") return true;
    if (
      u.protocol === "http:" &&
      (u.hostname === "localhost" || u.hostname === "127.0.0.1")
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function appendQuery(
  url: string,
  params: Record<string, string | undefined>,
): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) u.searchParams.set(k, v);
  }
  return u.toString();
}

function sendOAuthError(
  redirectUri: string | null,
  state: string | undefined,
  error: string,
  description: string,
  res: Response,
) {
  if (redirectUri) {
    return res.redirect(
      appendQuery(redirectUri, {
        error,
        error_description: description,
        state,
      }),
    );
  }
  return res.status(400).json({ error, error_description: description });
}

function rebuildAuthorizeUrl(
  issuer: string,
  query: Request["query"],
): string {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    if (typeof raw === "string") params.set(key, raw);
    else if (Array.isArray(raw) && typeof raw[0] === "string") {
      params.set(key, raw[0] as string);
    }
  }
  return `${issuer}/oauth/authorize?${params.toString()}`;
}

export function registerOAuthRoutes(app: Express, config: OAuthConfig) {
  // ── Discovery (RFC 8414 + RFC 9728) ──
  app.get("/.well-known/oauth-authorization-server", (_req, res) => {
    res.json({
      issuer: config.issuer,
      authorization_endpoint: `${config.issuer}/oauth/authorize`,
      token_endpoint: `${config.issuer}/oauth/token`,
      registration_endpoint: `${config.issuer}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["mcp"],
    });
  });

  app.get("/.well-known/oauth-protected-resource", (_req, res) => {
    res.json({
      resource: config.issuer,
      authorization_servers: [config.issuer],
      scopes_supported: ["mcp"],
      bearer_methods_supported: ["header"],
    });
  });

  // Some MCP clients probe the protected-resource metadata under /mcp.
  app.get("/mcp/.well-known/oauth-protected-resource", (_req, res) => {
    res.redirect(`${config.issuer}/.well-known/oauth-protected-resource`);
  });

  // ── Dynamic Client Registration (RFC 7591, public PKCE clients only) ──
  app.post("/oauth/register", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const redirectUris = body.redirect_uris;
    if (
      !Array.isArray(redirectUris) ||
      redirectUris.length === 0 ||
      !redirectUris.every(
        (u): u is string => typeof u === "string" && isAcceptableRedirectUri(u),
      )
    ) {
      return res.status(400).json({
        error: "invalid_redirect_uri",
        error_description:
          "redirect_uris must be a non-empty array of HTTPS URLs (http://localhost is allowed for development)",
      });
    }

    const clientId = generateOpaqueToken(24);
    const name =
      typeof body.client_name === "string" && body.client_name.trim().length > 0
        ? body.client_name.trim()
        : null;

    const created = await db.createClient({
      clientId,
      name,
      redirectUris,
    });

    return res.status(201).json({
      client_id: created.clientId,
      client_id_issued_at: Math.floor(created.createdAt.getTime() / 1000),
      redirect_uris: created.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      client_name: created.name ?? undefined,
    });
  });

  // ── Authorize ──
  app.get("/oauth/authorize", async (req, res) => {
    const responseType = String(req.query.response_type ?? "");
    const clientId = String(req.query.client_id ?? "");
    const redirectUri = String(req.query.redirect_uri ?? "");
    const scope = req.query.scope ? String(req.query.scope) : null;
    const state = req.query.state ? String(req.query.state) : undefined;
    const codeChallenge = req.query.code_challenge
      ? String(req.query.code_challenge)
      : "";
    const codeChallengeMethod = (
      req.query.code_challenge_method
        ? String(req.query.code_challenge_method)
        : "S256"
    ) as CodeChallengeMethod;

    if (responseType !== "code") {
      return sendOAuthError(
        null,
        state,
        "unsupported_response_type",
        "Only response_type=code is supported",
        res,
      );
    }
    if (!clientId) {
      return sendOAuthError(
        null,
        state,
        "invalid_request",
        "client_id is required",
        res,
      );
    }
    if (!redirectUri) {
      return sendOAuthError(
        null,
        state,
        "invalid_request",
        "redirect_uri is required",
        res,
      );
    }

    const client = await db.findClient(clientId);
    if (!client) {
      return sendOAuthError(
        null,
        state,
        "invalid_client",
        "Unknown client_id",
        res,
      );
    }
    if (!client.redirectUris.includes(redirectUri)) {
      return sendOAuthError(
        null,
        state,
        "invalid_request",
        "redirect_uri is not registered for this client",
        res,
      );
    }
    if (!codeChallenge) {
      return sendOAuthError(
        redirectUri,
        state,
        "invalid_request",
        "code_challenge is required (PKCE)",
        res,
      );
    }
    if (codeChallengeMethod !== "S256") {
      return sendOAuthError(
        redirectUri,
        state,
        "invalid_request",
        "code_challenge_method must be S256",
        res,
      );
    }

    const session = await getSessionFromCookie(
      config.apiOrigin,
      req.headers.cookie,
    );
    if (!session) {
      const callback = rebuildAuthorizeUrl(config.issuer, req.query);
      return res.redirect(
        appendQuery(config.loginUrl, { callbackUrl: callback }),
      );
    }

    // Auto-approve consent: this MCP server is gated by the email allowlist
    // upstream of better-auth, so any user who reaches this point with a
    // valid session is already authorized to use the meal planner.
    const code = generateOpaqueToken(32);
    await db.createAuthorizationCode({
      code,
      clientId: client.clientId,
      userId: session.id,
      redirectUri,
      scope,
      codeChallenge,
      codeChallengeMethod,
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000),
    });

    return res.redirect(appendQuery(redirectUri, { code, state }));
  });

  // ── Token ──
  app.post("/oauth/token", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    const body = (req.body ?? {}) as Record<string, unknown>;
    const grantType = String(body.grant_type ?? "");

    if (grantType === "authorization_code") {
      const code = typeof body.code === "string" ? body.code : "";
      const clientId =
        typeof body.client_id === "string" ? body.client_id : "";
      const redirectUri =
        typeof body.redirect_uri === "string" ? body.redirect_uri : "";
      const codeVerifier =
        typeof body.code_verifier === "string" ? body.code_verifier : "";

      if (!code || !clientId || !redirectUri || !codeVerifier) {
        return res.status(400).json({
          error: "invalid_request",
          error_description: "Missing required parameters",
        });
      }

      const stored = await db.consumeAuthorizationCode(code);
      if (!stored) {
        return res.status(400).json({
          error: "invalid_grant",
          error_description:
            "Authorization code is invalid, expired, or already used",
        });
      }
      if (
        stored.clientId !== clientId ||
        stored.redirectUri !== redirectUri
      ) {
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "client_id/redirect_uri mismatch",
        });
      }
      if (
        !verifyPkce(
          codeVerifier,
          stored.codeChallenge,
          stored.codeChallengeMethod as CodeChallengeMethod,
        )
      ) {
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "PKCE verifier mismatch",
        });
      }

      const accessToken = signAccessToken(
        {
          sub: stored.userId,
          client_id: stored.clientId,
          scope: stored.scope ?? undefined,
          iss: config.issuer,
          aud: config.issuer,
        },
        config.signingSecret,
        config.accessTokenTtl,
      );

      const refreshToken = generateOpaqueToken(48);
      await db.createRefreshToken({
        token: refreshToken,
        clientId: stored.clientId,
        userId: stored.userId,
        scope: stored.scope,
        expiresAt: new Date(Date.now() + config.refreshTokenTtl * 1000),
      });

      return res.json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: config.accessTokenTtl,
        refresh_token: refreshToken,
        scope: stored.scope ?? undefined,
      });
    }

    if (grantType === "refresh_token") {
      const refreshToken =
        typeof body.refresh_token === "string" ? body.refresh_token : "";
      const clientId =
        typeof body.client_id === "string" ? body.client_id : "";
      if (!refreshToken || !clientId) {
        return res.status(400).json({
          error: "invalid_request",
          error_description: "Missing required parameters",
        });
      }

      // Atomically consume the old refresh token. Two concurrent refreshes
      // can't both pass: only one updateMany flips revokedAt; the other
      // gets null here. The returned row carries the bound user/client/scope.
      const consumed = await db.consumeRefreshToken(refreshToken);
      if (!consumed) {
        return res.status(400).json({
          error: "invalid_grant",
          error_description:
            "Refresh token is invalid, expired, or already used",
        });
      }
      if (consumed.clientId !== clientId) {
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "client_id mismatch",
        });
      }

      const newRefresh = generateOpaqueToken(48);
      await db.createRefreshToken({
        token: newRefresh,
        clientId: consumed.clientId,
        userId: consumed.userId,
        scope: consumed.scope,
        expiresAt: new Date(Date.now() + config.refreshTokenTtl * 1000),
      });

      const accessToken = signAccessToken(
        {
          sub: consumed.userId,
          client_id: consumed.clientId,
          scope: consumed.scope ?? undefined,
          iss: config.issuer,
          aud: config.issuer,
        },
        config.signingSecret,
        config.accessTokenTtl,
      );

      return res.json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: config.accessTokenTtl,
        refresh_token: newRefresh,
        scope: consumed.scope ?? undefined,
      });
    }

    return res.status(400).json({
      error: "unsupported_grant_type",
      error_description: `Unsupported grant_type: ${grantType}`,
    });
  });
}
