import { prisma } from "@repo/database";
import { router, publicProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { RecipeCreate, RecipeListQuery, RecipeUpdate, Category } from "../schemas";

function toDTO(r: any) {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
  category: String(r.category) as Category,
    everydayScore: r.everydayScore,
    healthScore: r.healthScore,
    lastUsed: r.lastUsed ?? undefined,
    usageCount: r.usageCount,
    ingredients: (r.ingredients ?? []).map((ri: any) => ({
      ingredientId: ri.ingredientId,
      name: ri.ingredient.name,
      unit: ri.ingredient.unit ?? undefined,
      quantity: ri.quantity == null ? undefined : Number(ri.quantity),
      notes: ri.notes ?? undefined,
    })),
  };
}

function toDecimalInput(value: unknown) {
  if (value == null) return null;
  const raw = typeof value === "string" ? value.trim() : String(value);
  if (raw === "") return null;
  // Prisma Decimal fields accept string/number; return string to avoid importing Prisma.Decimal type
  return raw;
}

export const recipeRouter = router({
  list: publicProcedure
    .input(RecipeListQuery)
    .query(async ({ input }) => {
      const { page = 1, pageSize = 20, category, search } = input;
      const where: any = {
        ...(category ? { category } : {}),
        ...(search ? { name: { contains: search.trim() } } : {}),
      };
      const [total, items] = await Promise.all([
        prisma.recipe.count({ where }),
        prisma.recipe.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { ingredients: { include: { ingredient: true } } },
        }),
      ]);
      return { total, page, pageSize, items: items.map(toDTO) };
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const r = await prisma.recipe.findUnique({
        where: { id: input.id },
        include: { ingredients: { include: { ingredient: true } } },
      });
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Recipe not found" });
      return toDTO(r);
    }),

  create: publicProcedure
    .input(RecipeCreate)
    .mutation(async ({ input }) => {
      try {
        const { ingredients, ...data } = input;
        const created = await prisma.recipe.create({
          data: {
            ...data,
            ingredients: {
              create: ingredients.map((i) => ({
                notes: i.notes?.trim() ?? null,
                quantity: toDecimalInput(i.quantity),
                ingredient: {
                  connectOrCreate: {
                    where: { name: i.name.trim() },
                    create: { name: i.name.trim(), unit: i.unit?.trim() ?? null },
                  },
                },
              })),
            },
          },
          include: { ingredients: { include: { ingredient: true } } },
        });
        return toDTO(created);
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e?.message ?? "Create failed" });
      }
    }),

  update: publicProcedure
    .input(RecipeUpdate)
    .mutation(async ({ input }) => {
      const { id, ingredients, ...data } = input;
      const existing = await prisma.recipe.findUnique({ where: { id } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Recipe not found" });

      const updated = await prisma.recipe.update({
        where: { id },
        data: {
          ...data,
          ingredients: {
            deleteMany: {},
            create: ingredients.map((i) => ({
              notes: i.notes?.trim() ?? null,
              quantity: toDecimalInput(i.quantity),
              ingredient: {
                connectOrCreate: {
                  where: { name: i.name.trim() },
                  create: { name: i.name.trim(), unit: i.unit?.trim() ?? null },
                },
              },
            })),
          },
        },
        include: { ingredients: { include: { ingredient: true } } },
      });
      return toDTO(updated);
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      try {
        await prisma.recipe.delete({ where: { id: input.id } });
        return { ok: true };
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Delete failed" });
      }
    }),

  markUsed: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const r = await prisma.recipe.update({
        where: { id: input.id },
        data: { usageCount: { increment: 1 }, lastUsed: new Date() },
      });
      return { id: r.id, usageCount: r.usageCount, lastUsed: r.lastUsed };
    }),
});
