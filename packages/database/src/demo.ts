import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient } from "@prisma/client";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { seedDemoData } from "./demo-seed.js";

/**
 * Demo mode runs the whole app against an embedded, in-memory Postgres
 * (PGlite) instead of a real database. It is activated with a single env
 * variable so the web app can be hosted as an open, self-contained demo
 * (e.g. on Vercel) without a backend, database, or authentication.
 *
 * The database lives in process memory: every cold start gives a fresh,
 * freshly seeded dataset, so visitors can click around and mutate data
 * without any risk to real data.
 */
export function isDemoMode(): boolean {
  const value = process.env.NEXT_PUBLIC_DEMO_MODE?.trim().toLowerCase();
  return value === "1" || value === "true";
}

export const DEMO_USER = {
  id: "demo-user",
  email: "demo@butta.example",
  name: "Demobruker",
  image: null as string | null,
  role: "ADMIN" as const,
};

export const DEMO_HOUSEHOLD_NAME = "Demohusstanden";

interface DemoDb {
  pglite: PGlite;
  prisma: PrismaClient;
  ready: Promise<void>;
  householdId: string;
}

const globalForDemo = globalThis as unknown as { demoDb?: DemoDb };

function migrationsDir() {
  // Resolves to packages/database/prisma/migrations both when running from
  // src (tsx) and from dist (built output).
  return join(dirname(fileURLToPath(import.meta.url)), "..", "prisma", "migrations");
}

async function applyMigrations(pglite: PGlite) {
  const dir = migrationsDir();
  const migrations = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  for (const migration of migrations) {
    const sql = readFileSync(join(dir, migration, "migration.sql"), "utf8")
      // gen_random_uuid() is built into the Postgres core that PGlite ships
      // (PG >= 13), and the pgcrypto extension is not available in PGlite.
      .replace(/CREATE EXTENSION IF NOT EXISTS "?pgcrypto"?;/g, "");
    await pglite.exec(sql);
  }
}

async function initializeDemoDb(db: DemoDb) {
  await applyMigrations(db.pglite);
  db.householdId = await seedDemoData(db.prisma);
}

/** Lazily creates the shared embedded database for this process. */
export function getDemoDb(): DemoDb {
  if (!globalForDemo.demoDb) {
    // Prisma's constructor still wants the datasource env to exist even
    // though every query goes through the PGlite driver adapter.
    process.env.DATABASE_URL ??= "postgresql://demo:demo@localhost:5432/demo";

    const pglite = new PGlite({ extensions: { citext } });
    const adapter = new PrismaPGlite(pglite);
    const prisma = new PrismaClient({ adapter });
    const db: DemoDb = { pglite, prisma, ready: Promise.resolve(), householdId: "" };
    db.ready = initializeDemoDb(db).catch((error) => {
      // Allow the next request to retry instead of caching a broken instance.
      globalForDemo.demoDb = undefined;
      throw error;
    });
    globalForDemo.demoDb = db;
  }
  return globalForDemo.demoDb;
}

/** Waits until migrations and demo seeding have completed. */
export async function ensureDemoDatabaseReady(): Promise<{ householdId: string }> {
  const db = getDemoDb();
  await db.ready;
  return { householdId: db.householdId };
}
