import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink } from "better-auth/plugins/magic-link";
import { prisma } from "@repo/database";

const isDev = process.env.NODE_ENV !== "production";

const STANDARD_STORE_CATEGORY_ORDER = [
  "FRUKT_OG_GRONT",
  "KJOTT",
  "OST",
  "BROD",
  "MEIERI_OG_EGG",
  "HERMETIKK",
  "TORRVARER",
  "BAKEVARER",
  "HUSHOLDNING",
  "ANNET",
] as const;

// ─── Allowlist helpers ───

/**
 * Check if an email is allowed to use the app.
 * An email is allowed if it exists in the AllowedEmail table.
 */
async function isEmailAllowed(email: string): Promise<boolean> {
  // citext comparison is case-insensitive
  const entry = await prisma.allowedEmail.findUnique({
    where: { email: email.toLowerCase() },
  });
  return entry !== null;
}

// ─── Dev magic link store ───
// In development, we store the most recent magic link URL on globalThis so
// the frontend can offer a one-click login button (similar to the pattern
// used in home-inventory). This never runs in production.

type DevMagicLinkState = {
  url: string;
  createdAt: number;
};

const g = globalThis as unknown as {
  __devMagicLinkState?: DevMagicLinkState | null;
};

function setDevMagicLinkUrl(url: string) {
  if (!isDev) return;
  g.__devMagicLinkState = { url, createdAt: Date.now() };
}

/** Returns the latest dev magic link URL if it's less than 10 minutes old. */
export function getDevMagicLinkUrl(): string | null {
  if (!isDev) return null;
  const state = g.__devMagicLinkState;
  if (!state) return null;
  // Expire after 10 minutes
  if (Date.now() - state.createdAt > 10 * 60_000) {
    g.__devMagicLinkState = null;
    return null;
  }
  return state.url;
}

export const auth = betterAuth({
  basePath: "/auth",
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  socialProviders: {
    google: {
      clientId: process.env.AUTH_GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_CLIENT_SECRET ?? "",
      enabled: Boolean(process.env.AUTH_GOOGLE_CLIENT_ID),
    },
    github: {
      clientId: process.env.AUTH_GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.AUTH_GITHUB_CLIENT_SECRET ?? "",
      enabled: Boolean(process.env.AUTH_GITHUB_CLIENT_ID),
    },
    microsoft: {
      clientId: process.env.AUTH_MICROSOFT_CLIENT_ID ?? "",
      clientSecret: process.env.AUTH_MICROSOFT_CLIENT_SECRET ?? "",
      enabled: Boolean(process.env.AUTH_MICROSOFT_CLIENT_ID),
    },
    apple: {
      clientId: process.env.AUTH_APPLE_CLIENT_ID ?? "",
      clientSecret: process.env.AUTH_APPLE_CLIENT_SECRET ?? "",
      enabled: Boolean(process.env.AUTH_APPLE_CLIENT_ID),
    },
  },
  emailAndPassword: {
    enabled: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh session token every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5-minute client-side cookie cache
    },
  },
  trustedOrigins: (process.env.AUTH_TRUSTED_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((s) => s.trim()),
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        // ── Allowlist gate: reject magic-link requests from unknown emails ──
        const allowed = await isEmailAllowed(email);
        if (!allowed) {
          throw new Error("E-postadressen har ikke tilgang til appen.");
        }

        if (isDev) {
          setDevMagicLinkUrl(url);
          console.log("\n════════════════════════════════════════");
          console.log(`  Magic link for ${email}:`);
          console.log(`  ${url}`);
          console.log("  (Also available via /auth/dev/magic-link)");
          console.log("════════════════════════════════════════\n");
          return;
        }

        // Production: fail loudly if no email service is configured.
        // This prevents silent auth failures where users never receive
        // their magic link.
        throw new Error(
          "Magic link email service not configured. " +
          "Set up Resend, Postmark, or similar and update sendMagicLink in auth.ts.",
        );
      },
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // ── Allowlist gate: prevent account creation for non-approved emails ──
          // This covers OAuth providers where the magic link gate doesn't apply.
          const email = user.email;
          if (!email) return false;

          const allowed = await isEmailAllowed(email);
          if (!allowed) {
            return false;
          }
          return undefined; // allow creation
        },
        after: async (user) => {
          // Automatically create a household for new users
          const household = await prisma.household.create({
            data: {
              name: `${user.name ?? "Min"} husholdning`,
              members: {
                create: {
                  userId: user.id,
                  role: "OWNER",
                },
              },
            },
          });
          // Create a default shopping store for the household
          await prisma.shoppingStore.create({
            data: {
              name: "Standard butikk",
              isDefault: true,
              householdId: household.id,
              categoryOrder: [...STANDARD_STORE_CATEGORY_ORDER],
            },
          });
        },
      },
    },
  },
});

export type Auth = typeof auth;
