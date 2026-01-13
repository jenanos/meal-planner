import { prisma } from "@repo/database";
import { router, publicProcedure } from "../trpc.js";
import { IngredientById, IngredientCreate, IngredientListQuery, IngredientUpdate } from "../schemas.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const IngredientListItem = z.object({
    id: z.string().uuid(),
    name: z.string(),
    unit: z.string().optional(),
    usageCount: z.number().int(),
    isPantryItem: z.boolean(),
});

const IngredientWithRecipes = z.object({
    id: z.string().uuid(),
    name: z.string(),
    unit: z.string().optional(),
    isPantryItem: z.boolean(),
    recipes: z.array(
        z.object({
            id: z.string().uuid(),
            name: z.string(),
            category: z.string(),
            everydayScore: z.number().int(),
            healthScore: z.number().int(),
        })
    ),
});

export const ingredientRouter = router({
        list: publicProcedure
            .input(IngredientListQuery.optional())
            .output(z.array(IngredientListItem))
            .query(async ({ input }) => {
        const where = input?.search
            ? { name: { contains: input.search.trim(), mode: "insensitive" as const } }
            : {};
        const items = await prisma.ingredient.findMany({
            where,
            orderBy: { name: "asc" },
            include: { _count: { select: { recipes: true } } },
        });
                return items.map((i) => ({
            id: i.id,
            name: i.name,
            unit: i.unit ?? undefined,
            usageCount: i._count.recipes,
            isPantryItem: i.isPantryItem,
                }));
        }),

    create: publicProcedure
      .input(IngredientCreate)
      .output(z.object({ id: z.string().uuid(), name: z.string(), unit: z.string().optional(), isPantryItem: z.boolean() }))
      .mutation(async ({ input }) => {
        try {
            const trimmedName = input.name.trim();
            const up = await prisma.ingredient.upsert({
                where: { name: trimmedName },
                update: {
                    unit: input.unit?.trim() ?? null,
                    isPantryItem: Boolean(input.isPantryItem),
                },
                create: {
                    name: trimmedName,
                    unit: input.unit?.trim() ?? null,
                    isPantryItem: Boolean(input.isPantryItem),
                },
            });
            return { id: up.id, name: up.name, unit: up.unit ?? undefined, isPantryItem: up.isPantryItem };
        } catch (e: any) {
            throw new TRPCError({ code: "BAD_REQUEST", message: e?.message ?? "Failed to create ingredient" });
        }
    }),

    update: publicProcedure
      .input(IngredientUpdate)
      .output(z.object({ id: z.string().uuid(), name: z.string(), unit: z.string().optional(), isPantryItem: z.boolean() }))
      .mutation(async ({ input }) => {
        try {
            const trimmedName = input.name.trim();
            const updated = await prisma.ingredient.update({
                where: { id: input.id },
                data: {
                    name: trimmedName,
                    unit: input.unit?.trim() ?? null,
                    isPantryItem: Boolean(input.isPantryItem),
                },
            });
            return { id: updated.id, name: updated.name, unit: updated.unit ?? undefined, isPantryItem: updated.isPantryItem };
        } catch (e: any) {
            if (e?.code === "P2025") {
                throw new TRPCError({ code: "NOT_FOUND", message: "Ingredient not found" });
            }
            throw new TRPCError({ code: "BAD_REQUEST", message: e?.message ?? "Failed to update ingredient" });
        }
    }),

    getWithRecipes: publicProcedure
      .input(IngredientById)
      .output(IngredientWithRecipes)
      .query(async ({ input }) => {
        const ing = await prisma.ingredient.findUnique({
            where: { id: input.id },
            include: {
                recipes: {
                    include: { recipe: true },
                    orderBy: { recipe: { name: "asc" } },
                },
            },
        });
        if (!ing) throw new TRPCError({ code: "NOT_FOUND", message: "Ingredient not found" });

        return {
            id: ing.id,
            name: ing.name,
            unit: ing.unit ?? undefined,
            isPantryItem: ing.isPantryItem,
            recipes: ing.recipes.map((ri) => ({
                id: ri.recipe.id,
                name: ri.recipe.name,
                category: ri.recipe.category,
                everydayScore: ri.recipe.everydayScore,
                healthScore: ri.recipe.healthScore,
            })),
        };
    }),
});
