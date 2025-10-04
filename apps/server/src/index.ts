import 'dotenv/config';
console.log('DATABASE_URL at runtime:', process.env.DATABASE_URL);

import Fastify from "fastify";
import cors from "@fastify/cors";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { appRouter } from "@repo/api";     // <-- bruk pakkens rot, ikke /src/routers

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: ["http://localhost:3000", "http://127.0.0.1:3000"], // mer eksplisitt i dev
  credentials: true
});

await app.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: { router: appRouter }
});

app.get("/health", async () => ({ ok: true }));

// Readiness: ensure DB is migrated (check for WeekIndex table existence)
app.get("/ready", async () => {
  try {
    const client = await import("@repo/database");
    // Use a lightweight query that relies on schema existence
    await client.prisma.weekIndex.findFirst({ select: { id: true }, take: 1 });
    return { ready: true };
  } catch (e) {
    // Fastify will default to 200; force 503 for not ready
    throw Object.assign(new Error("Not ready"), { statusCode: 503 });
  }
});

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });
