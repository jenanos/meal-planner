import { createHmac, timingSafeEqual } from "node:crypto";

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function base64urlDecode(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

export interface AccessTokenClaims {
  sub: string;
  client_id: string;
  scope?: string;
  iss: string;
  aud: string;
}

export interface VerifiedAccessToken extends AccessTokenClaims {
  iat: number;
  exp: number;
}

export function signAccessToken(
  claims: AccessTokenClaims,
  secret: string,
  expiresInSeconds: number,
): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { ...claims, iat: now, exp: now + expiresInSeconds };
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = createHmac("sha256", secret).update(signingInput).digest();
  return `${signingInput}.${base64url(sig)}`;
}

export function verifyAccessToken(
  token: string,
  secret: string,
  expectedIssuer: string,
  expectedAudience: string,
): VerifiedAccessToken | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  const expectedSig = createHmac("sha256", secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  let actualSig: Buffer;
  try {
    actualSig = base64urlDecode(sigB64);
  } catch {
    return null;
  }
  if (expectedSig.length !== actualSig.length) return null;
  if (!timingSafeEqual(expectedSig, actualSig)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64).toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.exp !== "number" || p.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  if (p.iss !== expectedIssuer) return null;
  if (p.aud !== expectedAudience) return null;
  if (typeof p.sub !== "string" || typeof p.client_id !== "string") {
    return null;
  }
  return {
    sub: p.sub,
    client_id: p.client_id,
    scope: typeof p.scope === "string" ? p.scope : undefined,
    iss: String(p.iss),
    aud: String(p.aud),
    iat: typeof p.iat === "number" ? p.iat : 0,
    exp: p.exp,
  };
}
