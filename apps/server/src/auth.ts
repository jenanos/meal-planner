import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink } from "better-auth/plugins/magic-link";
import { emailOTP } from "better-auth/plugins/email-otp";
import { prisma } from "@repo/database";

const isDev = process.env.NODE_ENV !== "production";
const authSecret =
  process.env.AUTH_SECRET?.trim() ?? process.env.BETTER_AUTH_SECRET?.trim();
const authBaseURL =
  process.env.BETTER_AUTH_URL ??
  process.env.AUTH_BASE_URL ??
  (isDev ? "http://localhost:4000" : undefined);
const resendApiKey = process.env.RESEND_API_KEY?.trim();
const authEmailFrom =
  process.env.AUTH_EMAIL_FROM?.trim() ?? process.env.EMAIL_FROM?.trim();
const devTrustedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:3003",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:3002",
  "http://127.0.0.1:3003",
];

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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getRequiredEmailConfig() {
  if (!resendApiKey) {
    throw new Error("Auth email sending requires RESEND_API_KEY to be set.");
  }

  if (!authEmailFrom) {
    throw new Error(
      "Auth email sending requires AUTH_EMAIL_FROM or EMAIL_FROM to be set.",
    );
  }

  return {
    resendApiKey,
    authEmailFrom,
  };
}

async function sendMagicLinkEmail(email: string, url: string) {
  const { resendApiKey, authEmailFrom } = getRequiredEmailConfig();
  const safeUrl = escapeHtml(url);
  const safeEmail = escapeHtml(email);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: authEmailFrom,
      to: [email],
      subject: "Innloggingslenke til Butta",
      text: [
        "Klikk på lenken under for å logge inn i Butta:",
        url,
        "",
        "Hvis du ikke ba om denne e-posten, kan du ignorere den.",
      ].join("\n"),
      html: [
        "<p>Klikk på lenken under for å logge inn i Butta:</p>",
        `<p><a href="${safeUrl}">${safeUrl}</a></p>`,
        `<p>Denne lenken ble sendt til ${safeEmail}.</p>`,
        "<p>Hvis du ikke ba om denne e-posten, kan du ignorere den.</p>",
      ].join(""),
    }),
  });

  if (response.ok) {
    return;
  }

  const errorBody = await response.text();
  throw new Error(
    `Resend failed to send magic link (${response.status}): ${errorBody || "Unknown error"}`,
  );
}

async function sendOtpEmail(email: string, otp: string) {
  const { resendApiKey, authEmailFrom } = getRequiredEmailConfig();
  const safeOtp = escapeHtml(otp);
  const safeEmail = escapeHtml(email);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: authEmailFrom,
      to: [email],
      subject: "Innloggingskode til Butta",
      text: [
        `Din engangskode er: ${otp}`,
        "",
        "Koden er gyldig i 5 minutter.",
        "Hvis du ikke ba om denne e-posten, kan du ignorere den.",
      ].join("\n"),
      html: [
        "<p>Din engangskode er:</p>",
        `<p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${safeOtp}</p>`,
        "<p>Koden er gyldig i 5 minutter.</p>",
        `<p>Denne koden ble sendt til ${safeEmail}.</p>`,
        "<p>Hvis du ikke ba om denne e-posten, kan du ignorere den.</p>",
      ].join(""),
    }),
  });

  if (response.ok) {
    return;
  }

  const errorBody = await response.text();
  throw new Error(
    `Resend failed to send OTP (${response.status}): ${errorBody || "Unknown error"}`,
  );
}

export const auth = betterAuth({
  ...(authSecret ? { secret: authSecret } : {}),
  ...(authBaseURL ? { baseURL: authBaseURL } : {}),
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
  trustedOrigins: Array.from(
    new Set([
      ...(process.env.AUTH_TRUSTED_ORIGINS ?? "http://localhost:3000")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      ...(isDev ? devTrustedOrigins : []),
    ]),
  ),
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        // ── Allowlist gate: reject magic-link requests from unknown emails ──
        const allowed = await isEmailAllowed(email);
        if (!allowed) {
          throw new Error("E-postadressen har ikke tilgang til appen.");
        }

        await sendMagicLinkEmail(email, url);
      },
    }),
    emailOTP({
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (type !== "sign-in") return;
        // ── Allowlist gate: reject OTP requests from unknown emails ──
        const allowed = await isEmailAllowed(email);
        if (!allowed) {
          throw new Error("E-postadressen har ikke tilgang til appen.");
        }

        await sendOtpEmail(email, otp);
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
      },
    },
  },
});

export type Auth = typeof auth;
