import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient } from "@repo/database";
import { __internal } from "../../src/oauth/db";

/**
 * The OAuth store talks to Postgres, so the tests run against a real one:
 * PGlite, the embedded Postgres the app already uses for demo mode, with the
 * repo's own migrations applied. Mocking Prisma here would leave the parts
 * that actually matter — the guarded updates that make code consumption and
 * token rotation atomic — untested.
 */

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../packages/database/prisma/migrations",
);

export const TEST_USER_IDS = ["user-1", "user-2"] as const;

let pglite: PGlite | undefined;
let prisma: PrismaClient | undefined;

async function applyMigrations(db: PGlite) {
  const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  for (const migration of migrations) {
    // pgcrypto isn't available in PGlite; gen_random_uuid() is built into
    // the Postgres core it ships (PG >= 13).
    const sql = readFileSync(
      join(MIGRATIONS_DIR, migration, "migration.sql"),
      "utf8",
    ).replace(/CREATE EXTENSION IF NOT EXISTS "?pgcrypto"?;/g, "");
    await db.exec(sql);
  }
}

/** Boots the embedded database once per test file. */
export async function setupOAuthTestDb(): Promise<PrismaClient> {
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
  pglite = new PGlite({ extensions: { citext } });
  await applyMigrations(pglite);
  prisma = new PrismaClient({ adapter: new PrismaPGlite(pglite) });
  __internal.setPrismaClient(prisma);
  return prisma;
}

export async function teardownOAuthTestDb(): Promise<void> {
  await prisma?.$disconnect();
  await pglite?.close();
  prisma = undefined;
  pglite = undefined;
}

/**
 * Wipes OAuth state between tests and re-seeds the users the OAuth rows
 * reference (userId is a foreign key into User).
 */
export async function resetOAuthTestDb(): Promise<void> {
  if (!prisma) throw new Error("setupOAuthTestDb() must run first");
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "OAuthClient", "OAuthAuthorizationCode", "OAuthRefreshToken", ' +
      '"OAuthPendingApproval", "OAuthClientApproval", "User" CASCADE',
  );
  for (const id of TEST_USER_IDS) {
    await prisma.user.create({
      data: {
        id,
        name: id,
        email: `${id}@example.com`,
        updatedAt: new Date(),
      },
    });
  }
}

/** Registers a client row so codes/tokens have a valid clientId to point at. */
export async function seedClient(
  clientId: string,
  redirectUris = ["https://client.example/cb"],
): Promise<void> {
  if (!prisma) throw new Error("setupOAuthTestDb() must run first");
  await prisma.oAuthClient.create({
    data: { clientId, name: null, redirectUris, updatedAt: new Date() },
  });
}
