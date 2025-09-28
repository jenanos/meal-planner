import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Sett en fornuftig default i dev hvis env ikke er satt
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Normaliser SQLite-URL i dev til absolutt sti og sørg for at katalogen finnes
function normalizeDevSqliteUrl() {
  if (process.env.NODE_ENV === "production") return;

  const defaultDb = path.resolve(__dirname, "../prisma/dev.db");
  let url = process.env.DATABASE_URL;

  if (!url) {
    url = `file:${defaultDb}`;
  } else if (url.startsWith("file:")) {
    const raw = url.slice("file:".length);
    // Kandidater: relativ til CWD og relativ til database-pakken (stabilt)
    const candidates = [
      path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw),
      path.isAbsolute(raw) ? raw : path.resolve(__dirname, "../prisma", raw.replace(/^(\.\/)?/, "")),
    ];
    const pick = candidates.find((p) => fs.existsSync(path.dirname(p))) ?? defaultDb;
    url = `file:${pick}`;
  }

  const dbPath = url.replace(/^file:/, "");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  process.env.DATABASE_URL = url;

  // For debugging ved behov:
  // console.log(`[database] Using ${process.env.DATABASE_URL}`);
}
normalizeDevSqliteUrl();

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ log: ["warn", "error"] });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
