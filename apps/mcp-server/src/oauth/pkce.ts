import { createHash, timingSafeEqual } from "node:crypto";

export type CodeChallengeMethod = "S256" | "plain";

export function verifyPkce(
  verifier: string,
  challenge: string,
  method: CodeChallengeMethod,
): boolean {
  if (!verifier || !challenge) return false;
  if (method === "plain") {
    const a = Buffer.from(verifier);
    const b = Buffer.from(challenge);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
  if (method === "S256") {
    const computed = createHash("sha256").update(verifier).digest("base64url");
    const a = Buffer.from(computed);
    const b = Buffer.from(challenge);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
  return false;
}
