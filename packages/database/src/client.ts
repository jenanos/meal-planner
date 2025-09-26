import { PrismaClient } from "@prisma/client";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Sett en fornuftig default i dev hvis env ikke er satt
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
if (!process.env.DATABASE_URL && process.env.NODE_ENV !== "production") {
  process.env.DATABASE_URL = `file:${path.resolve(__dirname, "../prisma/dev.db")}`;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ log: ["warn", "error"] });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
