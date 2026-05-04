export * from "./routers/index.js";
export * from "./schemas.js";
export type { AuthUser, CreateContextOptions } from "./trpc.js";
// Re-export the Prisma client so apps that already depend on @repo/api
// (e.g. mcp-server's OAuth provider) can reach the DB without declaring a
// separate @repo/database dependency.
export { prisma } from "@repo/database";
