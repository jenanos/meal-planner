import { describe, it, expect } from "vitest";
import { signAccessToken, verifyAccessToken } from "../src/oauth/jwt";

const SECRET = "test-secret";
const ISSUER = "https://mcp.example.com";

const baseClaims = {
  sub: "user-1",
  client_id: "client-1",
  scope: "mcp",
  iss: ISSUER,
  aud: ISSUER,
};

describe("signAccessToken / verifyAccessToken", () => {
  it("round-trips valid claims", () => {
    const token = signAccessToken(baseClaims, SECRET, 60);
    const verified = verifyAccessToken(token, SECRET, ISSUER, ISSUER);
    expect(verified).not.toBeNull();
    expect(verified!.sub).toBe("user-1");
    expect(verified!.client_id).toBe("client-1");
    expect(verified!.scope).toBe("mcp");
    expect(verified!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects a token signed with a different secret", () => {
    const token = signAccessToken(baseClaims, "other-secret", 60);
    expect(verifyAccessToken(token, SECRET, ISSUER, ISSUER)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signAccessToken(baseClaims, SECRET, -10);
    expect(verifyAccessToken(token, SECRET, ISSUER, ISSUER)).toBeNull();
  });

  it("rejects issuer mismatch", () => {
    const token = signAccessToken(baseClaims, SECRET, 60);
    expect(
      verifyAccessToken(token, SECRET, "https://evil.example.com", ISSUER),
    ).toBeNull();
  });

  it("rejects audience mismatch", () => {
    const token = signAccessToken(baseClaims, SECRET, 60);
    expect(
      verifyAccessToken(token, SECRET, ISSUER, "https://evil.example.com"),
    ).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const token = signAccessToken(baseClaims, SECRET, 60);
    const [header, payload, sig] = token.split(".");
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    decoded.sub = "user-2";
    const forged = Buffer.from(JSON.stringify(decoded)).toString("base64url");
    expect(
      verifyAccessToken(`${header}.${forged}.${sig}`, SECRET, ISSUER, ISSUER),
    ).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyAccessToken("", SECRET, ISSUER, ISSUER)).toBeNull();
    expect(verifyAccessToken("a.b", SECRET, ISSUER, ISSUER)).toBeNull();
    expect(verifyAccessToken("a.b.c.d", SECRET, ISSUER, ISSUER)).toBeNull();
    expect(verifyAccessToken("not-a-jwt", SECRET, ISSUER, ISSUER)).toBeNull();
  });
});
