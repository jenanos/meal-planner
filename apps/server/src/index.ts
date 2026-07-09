import "./load-env.js";

import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { appRouter } from "@repo/api";
import {
  ensureBootstrapState,
  getBootstrapConfigFromEnv,
  prisma,
  syncBootstrapStateForUser,
} from "@repo/database";
import { auth } from "./auth.js";
import type { CreateContextOptions } from "@repo/api";

const isDev = process.env.NODE_ENV !== "production";
const BOOTSTRAP_HOUSEHOLD_NAME =
  getBootstrapConfigFromEnv().householdName;
const MCP_API_KEY = process.env.MCP_API_KEY?.trim() || null;

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

async function resolveActiveHouseholdId(userId: string) {
  const memberships = await prisma.householdMember.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      householdId: true,
      household: {
        select: {
          name: true,
          _count: {
            select: {
              weekPlans: true,
              weekIndices: true,
              shoppingStates: true,
              extraCatalog: true,
              extraItems: true,
              shoppingStores: true,
              shoppingPackages: true,
              freezerItems: true,
            },
          },
        },
      },
    },
  });

  if (memberships.length === 0) {
    return null;
  }

  if (memberships.length === 1) {
    return memberships[0].householdId;
  }

  const canonicalMembership = memberships.find(
    (membership) => membership.household.name === BOOTSTRAP_HOUSEHOLD_NAME,
  );
  if (canonicalMembership) {
    return canonicalMembership.householdId;
  }

  const dataBearingMemberships = memberships.filter((membership) =>
    Object.values(membership.household._count).some((count) => count > 0),
  );
  if (dataBearingMemberships.length === 1) {
    return dataBearingMemberships[0].householdId;
  }

  // Never leave an authenticated user without a household context when they
  // already have memberships. The query is ordered oldest-first, so this is
  // the final deterministic fallback.
  return memberships[0].householdId;
}

/**
 * Resolve a household ID for service-to-service calls (e.g. MCP server with
 * no `x-mcp-on-behalf-of` header). Uses the bootstrap household when
 * configured, otherwise falls back to the oldest household in the database.
 */
async function resolveServiceHouseholdId(): Promise<string | null> {
  if (BOOTSTRAP_HOUSEHOLD_NAME) {
    const household = await prisma.household.findFirst({
      where: { name: BOOTSTRAP_HOUSEHOLD_NAME },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (household) return household.id;
  }

  const fallback = await prisma.household.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return fallback?.id ?? null;
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

function isValidApiKey(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function buildOnBehalfOfContext(userId: string): Promise<CreateContextOptions> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, image: true, role: true },
  });
  if (!user) {
    return { user: null, householdId: null };
  }
  const householdId = await resolveActiveHouseholdId(user.id);
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image ?? null,
      role: (user.role as "USER" | "ADMIN") ?? "USER",
    },
    householdId,
  };
}

async function createContext({ req }: { req: { headers: Record<string, string | string[] | undefined> } }): Promise<CreateContextOptions> {
  // ── Service-to-service auth via API key (e.g. MCP server) ──
  const apiKey = typeof req.headers["x-api-key"] === "string" ? req.headers["x-api-key"] : null;
  if (apiKey && MCP_API_KEY && isValidApiKey(apiKey, MCP_API_KEY)) {
    // When the MCP server is acting on behalf of a real user (after OAuth),
    // it forwards the user id here. The household is then resolved from the
    // user's actual memberships, not the bootstrap fallback.
    const onBehalfRaw = req.headers["x-mcp-on-behalf-of"];
    const onBehalfUserId =
      typeof onBehalfRaw === "string" && onBehalfRaw.trim().length > 0
        ? onBehalfRaw.trim()
        : null;
    if (onBehalfUserId) {
      return buildOnBehalfOfContext(onBehalfUserId);
    }

    const householdId = await resolveServiceHouseholdId();
    return {
      user: {
        id: "service:mcp",
        email: "mcp@internal",
        name: "MCP Service",
        role: "USER",
      },
      householdId,
    };
  }

  const session = await auth.api.getSession({
    headers: new Headers(
      Object.entries(req.headers).flatMap(([key, value]) => {
        if (value === undefined) return [];
        if (Array.isArray(value)) return value.map((v) => [key, v] as [string, string]);
        return [[key, value] as [string, string]];
      }),
    ),
    // Always validate against the Session table so revoked sessions (e.g.
    // after allowlist removal) lose API access immediately instead of after
    // the 5-minute cookie cache expires.
    query: { disableCookieCache: true },
  });

  if (!session?.user) {
    return { user: null, householdId: null };
  }

  await syncBootstrapStateForUser({
    id: session.user.id,
    email: session.user.email,
  });

  // Look up the user's role and resolve an active household deterministically.
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  const householdId = await resolveActiveHouseholdId(session.user.id);

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image ?? null,
      role: (dbUser?.role as "USER" | "ADMIN") ?? "USER",
    },
    householdId,
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

// Readiness: ensure DB is migrated (check that weekIndex table is queryable)
app.get("/ready", async () => {
  try {
    await prisma.weekIndex.findFirst({ select: { id: true }, take: 1 });
    return { ready: true };
  } catch {
    throw Object.assign(new Error("Not ready"), { statusCode: 503 });
  }
});

await ensureBootstrapState();

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });
