import { prisma } from "@repo/database";
import { router, publicProcedure } from "../trpc.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { RecipeCreate, RecipeListQuery, RecipeUpdate, Category } from "../schemas.js";

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
        ...(search ? { name: { contains: search.trim(), mode: 'insensitive' } } : {}),
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
      const { id, ingredients, ...fields } = input;
      const existing = await prisma.recipe.findUnique({ where: { id } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Recipe not found" });

      const data: Record<string, unknown> = {};
      if (fields.name !== undefined) data.name = fields.name;
      if (fields.description !== undefined) data.description = fields.description;
      if (fields.category !== undefined) data.category = fields.category;
      if (fields.everydayScore !== undefined) data.everydayScore = fields.everydayScore;
      if (fields.healthScore !== undefined) data.healthScore = fields.healthScore;

      if (ingredients !== undefined) {
        data.ingredients = {
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
        };
      }

      const updated = await prisma.recipe.update({
        where: { id },
        data,
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

  patchField: publicProcedure
    .input(z.object({
      id: z.string().uuid(),
      category: Category.optional(),
      healthScore: z.number().int().min(1).max(5).optional(),
      everydayScore: z.number().int().min(1).max(5).optional(),
    }).refine(
      (v) => v.category !== undefined || v.healthScore !== undefined || v.everydayScore !== undefined,
      { message: "At least one field must be provided" },
    ))
    .mutation(async ({ input }) => {
      const { id, ...fields } = input;
      const data: Record<string, unknown> = {};
      if (fields.category !== undefined) data.category = fields.category;
      if (fields.healthScore !== undefined) data.healthScore = fields.healthScore;
      if (fields.everydayScore !== undefined) data.everydayScore = fields.everydayScore;
      try {
        const r = await prisma.recipe.update({ where: { id }, data });
        return { id: r.id, category: r.category, healthScore: r.healthScore, everydayScore: r.everydayScore };
      } catch (e: any) {
        if (e?.code === "P2025") throw new TRPCError({ code: "NOT_FOUND", message: "Recipe not found" });
        throw new TRPCError({ code: "BAD_REQUEST", message: e?.message ?? "Patch failed" });
      }
    }),
});
