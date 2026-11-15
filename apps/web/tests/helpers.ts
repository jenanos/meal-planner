import type { BrowserContext } from "@playwright/test";

const API_URL = process.env.E2E_API_URL ?? "http://localhost:4000";
const WEB_URL = process.env.E2E_WEB_URL ?? "http://localhost:3000";

/** An allowlisted e-mail address belonging to a household with recipes. */
export const E2E_EMAIL = process.env.E2E_EMAIL;

/** Why the suite cannot run here, or null when it can. */
export const missingSetup =
  !E2E_EMAIL || !process.env.DATABASE_URL
    ? "Set E2E_EMAIL and DATABASE_URL to run the end-to-end tests"
    : null;

/**
 * Sign the browser context in with a one-time code. The code is normally
 * e-mailed; here it is read straight from the database, so sending may fail.
 */
export async function signIn(context: BrowserContext) {
  const headers = { origin: WEB_URL };
  await context.request.post(
    `${API_URL}/auth/email-otp/send-verification-otp`,
    { headers, data: { email: E2E_EMAIL, type: "sign-in" } },
  );

  const { prisma } = await import("@repo/database");
  const verification = await prisma.verification.findFirst({
    where: { identifier: `sign-in-otp-${E2E_EMAIL}` },
    orderBy: { createdAt: "desc" },
  });
  const otp = verification?.value.split(":")[0];
  if (!otp) throw new Error(`No sign-in code found for ${E2E_EMAIL}`);

  const response = await context.request.post(
    `${API_URL}/auth/sign-in/email-otp`,
    { headers, data: { email: E2E_EMAIL, otp } },
  );
  if (!response.ok()) {
    throw new Error(
      `Sign-in failed: ${response.status()} ${await response.text()}`,
    );
  }
}
