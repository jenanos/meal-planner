import 'dotenv/config';

import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { appRouter } from "@repo/api";
import { prisma } from "@repo/database";
import { auth, getDevMagicLinkUrl } from "./auth.js";
import type { CreateContextOptions } from "@repo/api";

const isDev = process.env.NODE_ENV !== "production";

const trustedOrigins = (process.env.AUTH_TRUSTED_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isAllowedOrigin(origin: string | undefined) {
  if (!origin) return false;
  if (isDev) {
    return (
      /^http:\/\/localhost:\d+$/.test(origin) ||
      /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
    );
  }
  return trustedOrigins.includes(origin);
}

function toWebRequest(base: string, req: IncomingMessage) {
  const method = req.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";

  return new Request(`${base}${req.url ?? "/"}`, {
    method,
    headers: req.headers as HeadersInit,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    duplex: hasBody ? "half" : undefined,
  } as RequestInit & { duplex?: "half" });
}

async function sendWebResponse(res: ServerResponse, response: Response) {
  for (const [key, value] of response.headers) {
    if (key === "set-cookie") {
      const setCookies =
        "getSetCookie" in response.headers
          ? response.headers.getSetCookie()
          : [value];
      res.setHeader(key, setCookies);
      continue;
    }

    res.setHeader(key, value);
  }

  res.statusCode = response.status;
  const body = response.body ? Buffer.from(await response.arrayBuffer()) : null;
  res.writeHead(response.status);
  res.end(body ?? undefined);
}

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

  const handler = "handler" in auth ? auth.handler : auth;

  authApp.all("/auth/*", async (request, reply) => {
    const originHeader =
      typeof request.headers.origin === "string"
        ? request.headers.origin
        : undefined;
    const allowedOrigin =
      originHeader && isAllowedOrigin(originHeader) ? originHeader : null;

    if (allowedOrigin) {
      reply.raw.setHeader("Access-Control-Allow-Origin", allowedOrigin);
      reply.raw.setHeader("Access-Control-Allow-Credentials", "true");
      reply.raw.setHeader("Vary", "Origin");
      reply.raw.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
      );
      reply.raw.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      );
    }

    if (request.method === "OPTIONS") {
      reply.code(204).send();
      return;
    }

    const base = `${
      request.raw.headers["x-forwarded-proto"] ||
      (
        "encrypted" in request.raw.socket &&
        Boolean(
          (request.raw.socket as typeof request.raw.socket & { encrypted?: boolean })
            .encrypted,
        )
          ? "https"
          : "http"
      )
    }://${request.raw.headers[":authority"] || request.raw.headers.host}`;
    const authRequest = toWebRequest(base, request.raw);
    const response = await handler(authRequest);

    if (allowedOrigin) {
      response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
      response.headers.set("Access-Control-Allow-Credentials", "true");
      response.headers.set("Vary", "Origin");
      response.headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
      );
      response.headers.set(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      );
    }

    reply.hijack();
    await sendWebResponse(reply.raw, response);
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
