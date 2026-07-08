import { PrismaClient } from "@prisma/client";
export { Prisma } from "@prisma/client";
import { getDemoDb, isDemoMode } from "./demo.js";

function ensureDatabaseUrl() {
  const url = process.env.DATABASE_URL?.trim();
  if (url) return;

  if (process.env.NODE_ENV === "test") {
    process.env.DATABASE_URL =
      process.env.TEST_DATABASE_URL?.trim() ??
      "postgresql://localhost:5432/placeholder_test_db";
    return;
  }

  const hint =
    process.env.NODE_ENV === "production"
      ? "Set DATABASE_URL in your production environment (e.g. secret manager, container env vars)."
      : "Create packages/database/prisma/.env based on .env.example and set DATABASE_URL for your local Postgres instance.";

  throw new Error(`DATABASE_URL is not set. ${hint}`);
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  // Demo mode swaps the real Postgres for an embedded in-memory PGlite
  // instance, so the app runs without DATABASE_URL or any external services.
  if (isDemoMode()) {
    return getDemoDb().prisma;
  }
  ensureDatabaseUrl();
  return new PrismaClient({ log: ["warn", "error"] });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
