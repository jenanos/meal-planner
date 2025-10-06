import { PrismaClient } from "@prisma/client";
export { Prisma } from "@prisma/client";
function ensureDatabaseUrl() {
    const url = process.env.DATABASE_URL?.trim();
    if (url)
        return;
    if (process.env.NODE_ENV === "test") {
        process.env.DATABASE_URL =
            process.env.TEST_DATABASE_URL?.trim() ??
                "postgresql://localhost:5432/placeholder_test_db";
        return;
    }
    const hint = process.env.NODE_ENV === "production"
        ? "Set DATABASE_URL in your production environment (e.g. secret manager, container env vars)."
        : "Create packages/database/prisma/.env based on .env.example and set DATABASE_URL for your local Postgres instance.";
    throw new Error(`DATABASE_URL is not set. ${hint}`);
}
ensureDatabaseUrl();
const globalForPrisma = globalThis;
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ log: ["warn", "error"] });
if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}
