import { prisma } from "@repo/database";
import { router, publicProcedure } from "../trpc";
import { IngredientById, IngredientCreate, IngredientListQuery } from "../schemas";
import { TRPCError } from "@trpc/server";
export const ingredientRouter = router({
    list: publicProcedure.input(IngredientListQuery.optional()).query(async ({ input }) => {
        const where = input?.search
            ? { name: { contains: input.search.trim() } }
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
        }));
    }),
    create: publicProcedure.input(IngredientCreate).mutation(async ({ input }) => {
        try {
            const trimmedName = input.name.trim();
            const up = await prisma.ingredient.upsert({
                where: { name: trimmedName },
                update: { unit: input.unit?.trim() ?? null },
                create: { name: trimmedName, unit: input.unit?.trim() ?? null },
            });
            return { id: up.id, name: up.name, unit: up.unit ?? undefined };
        }
        catch (e) {
            throw new TRPCError({ code: "BAD_REQUEST", message: e?.message ?? "Failed to create ingredient" });
        }
    }),
    getWithRecipes: publicProcedure.input(IngredientById).query(async ({ input }) => {
        const ing = await prisma.ingredient.findUnique({
            where: { id: input.id },
            include: {
                recipes: {
                    include: { recipe: true },
                    orderBy: { recipe: { name: "asc" } },
                },
            },
        });
        if (!ing)
            throw new TRPCError({ code: "NOT_FOUND", message: "Ingredient not found" });
        return {
            id: ing.id,
            name: ing.name,
            unit: ing.unit ?? undefined,
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
