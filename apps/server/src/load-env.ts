import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const serverEnvPath = path.resolve(currentDir, "../.env");
const databaseEnvPath = path.resolve(currentDir, "../../../packages/database/prisma/.env");

dotenv.config({ path: serverEnvPath, quiet: true });

function isPlaceholderDatabaseUrl(value: string | undefined) {
  if (!value) return true;
  return /<[^>]+>/.test(value);
}

if (isPlaceholderDatabaseUrl(process.env.DATABASE_URL)) {
  const databaseEnv = dotenv.config({ path: databaseEnvPath, quiet: true });
  const databaseUrl = databaseEnv.parsed?.DATABASE_URL?.trim();

  if (databaseUrl) {
    process.env.DATABASE_URL = databaseUrl;
  }
}
