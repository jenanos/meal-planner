import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink } from "better-auth/plugins/magic-link";
import { prisma } from "@repo/database";

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
    expiresIn: 60 * 60 * 24 * 180, // 6 months
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
        // TODO: Replace with real email service (e.g. Resend, Postmark)
        console.log(`[Auth] Magic link for ${email}: ${url}`);
      },
    }),
  ],
  databaseHooks: {
    user: {
      create: {
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
