import 'dotenv/config';

import Fastify from "fastify";
import cors from "@fastify/cors";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { toNodeHandler } from "better-auth/node";
import { appRouter } from "@repo/api";
import { prisma } from "@repo/database";
import { auth, getDevMagicLinkUrl } from "./auth.js";
import type { CreateContextOptions } from "@repo/api";

const isDev = process.env.NODE_ENV !== "production";

const trustedOrigins = (process.env.AUTH_TRUSTED_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: isDev
    ? [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/]
    : trustedOrigins,
  credentials: true,
});

// ─── Auth routes (better-auth) ───
// Register in a sub-scope with body parsing disabled so better-auth can
// read the raw request body itself.
await app.register(async (authApp) => {
  authApp.removeAllContentTypeParsers();
  authApp.addContentTypeParser("*", (_request, _payload, done) => {
    done(null);
  });

  const handler = toNodeHandler(auth);

  authApp.all("/auth/*", async (request, reply) => {
    reply.hijack();
    await handler(request.raw, reply.raw);
  });
});

// ─── tRPC ───
async function createContext({ req }: { req: { headers: Record<string, string | string[] | undefined> } }): Promise<CreateContextOptions> {
  const session = await auth.api.getSession({
    headers: new Headers(
      Object.entries(req.headers).flatMap(([key, value]) => {
        if (value === undefined) return [];
        if (Array.isArray(value)) return value.map((v) => [key, v] as [string, string]);
        return [[key, value] as [string, string]];
      }),
    ),
  });

  if (!session?.user) {
    return { user: null, householdId: null };
  }

  // Look up the user's role and first household membership
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  const membership = await prisma.householdMember.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { householdId: true },
  });

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image ?? null,
      role: (dbUser?.role as "USER" | "ADMIN") ?? "USER",
    },
    householdId: membership?.householdId ?? null,
  };
}

await app.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: {
    router: appRouter,
    createContext,
  },
});

app.get("/health", async () => ({ ok: true }));

// Dev-only: expose the latest magic link URL so the frontend can offer
// a one-click login button instead of requiring email access.
if (isDev) {
  app.get("/auth/dev/magic-link", async () => {
    const url = getDevMagicLinkUrl();
    return { url };
  });
}

// Readiness: ensure DB is migrated (check for User table existence)
app.get("/ready", async () => {
  try {
    await prisma.weekIndex.findFirst({ select: { id: true }, take: 1 });
    return { ready: true };
  } catch {
    throw Object.assign(new Error("Not ready"), { statusCode: 503 });
  }
});

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });
