import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { verifyPkce } from "../src/oauth/pkce";

function s256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

describe("verifyPkce", () => {
  it("accepts a matching S256 verifier", () => {
    const verifier = "correct-horse-battery-staple-1234567890";
    expect(verifyPkce(verifier, s256(verifier), "S256")).toBe(true);
  });

  it("rejects a wrong S256 verifier", () => {
    expect(verifyPkce("wrong-verifier", s256("right-verifier"), "S256")).toBe(
      false,
    );
  });

  it("rejects when the verifier is used directly as challenge under S256", () => {
    const verifier = "correct-horse-battery-staple-1234567890";
    expect(verifyPkce(verifier, verifier, "S256")).toBe(false);
  });

  it("accepts matching plain values", () => {
    expect(verifyPkce("abc123", "abc123", "plain")).toBe(true);
  });

  it("rejects mismatching plain values", () => {
    expect(verifyPkce("abc123", "abc124", "plain")).toBe(false);
  });

  it("rejects empty verifier or challenge", () => {
    expect(verifyPkce("", s256(""), "S256")).toBe(false);
    expect(verifyPkce("something", "", "S256")).toBe(false);
  });

  it("rejects unknown methods", () => {
    expect(
      verifyPkce("abc", "abc", "md5" as unknown as "S256"),
    ).toBe(false);
  });
});
