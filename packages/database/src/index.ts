export * from "./client"; // gjør named export: prisma
export { Prisma, PrismaClient } from "@prisma/client";

export const CATEGORIES = ["FISK", "VEGETAR", "KYLLING", "STORFE", "ANNET"] as const;
