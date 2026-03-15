import { prisma } from "@repo/database";
import { router, publicProcedure } from "../trpc.js";
import { IngredientById, IngredientCreate, IngredientCategory, IngredientListQuery, IngredientUpdate } from "../schemas.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const IngredientListItem = z.object({
    id: z.string().uuid(),
    name: z.string(),
    unit: z.string().optional(),
    usageCount: z.number().int(),
    isPantryItem: z.boolean(),
    category: IngredientCategory,
});

const IngredientWithRecipes = z.object({
    id: z.string().uuid(),
    name: z.string(),
    unit: z.string().optional(),
    isPantryItem: z.boolean(),
    category: IngredientCategory,
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

function normalizeIngredientCategory(category: string): z.infer<typeof IngredientCategory> {
    const normalized = category.toUpperCase();
    if (normalized === "UKATEGORISERT") return "ANNET";
    if (normalized === "FRUKT" || normalized === "GRONNSAKER") {
        return "FRUKT_OG_GRONT";
    }
    if (
        IngredientCategory.options.includes(
            normalized as z.infer<typeof IngredientCategory>,
        )
    ) {
        return normalized as z.infer<typeof IngredientCategory>;
    }
    return "ANNET";
}

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
                category: normalizeIngredientCategory(i.category),
            }));
        }),

    listWithoutUnit: publicProcedure
        .output(z.array(IngredientListItem))
        .query(async () => {
            const items = await prisma.ingredient.findMany({
                where: { unit: null },
                orderBy: { name: "asc" },
                include: { _count: { select: { recipes: true } } },
            });
            return items.map((i) => ({
                id: i.id,
                name: i.name,
                unit: i.unit ?? undefined,
                usageCount: i._count.recipes,
                isPantryItem: i.isPantryItem,
                category: normalizeIngredientCategory(i.category),
            }));
        }),

    listPotentialDuplicates: publicProcedure
        .output(z.array(z.array(IngredientListItem)))
        .query(async () => {
            const allIngredients = await prisma.ingredient.findMany({
                orderBy: { name: "asc" },
                include: { _count: { select: { recipes: true } } },
            });

            // Normalize name for comparison
            const normalize = (name?: string) =>
                name?.toLowerCase().replace(/[^a-zæøå0-9]/g, "") ?? "";

            // Group ingredients by normalized name prefix
            const groups = new Map<string, typeof allIngredients>();

            for (const ing of allIngredients) {
                const normalized = normalize(ing.name);
                if (!normalized) {
                    continue;
                }
                let foundGroup = false;

                // Check if this ingredient matches any existing group
                for (const [key, group] of groups.entries()) {
                    // Check if names are similar (prefix match or edit distance)
                    if (
                        normalized.startsWith(key) ||
                        key.startsWith(normalized) ||
                        (normalized.length > 3 && key.length > 3 &&
                            (normalized.includes(key) || key.includes(normalized)))
                    ) {
                        group.push(ing);
                        foundGroup = true;
                        break;
                    }
                }

                if (!foundGroup) {
                    groups.set(normalized, [ing]);
                }
            }

            // Filter to only groups with more than one ingredient
            const duplicateGroups = Array.from(groups.values())
                .filter(group => group.length > 1)
                .map(group =>
                    group.map(i => ({
                        id: i.id,
                        name: i.name,
                        unit: i.unit ?? undefined,
                        usageCount: i._count.recipes,
                        isPantryItem: i.isPantryItem,
                        category: normalizeIngredientCategory(i.category),
                    }))
                );

            return duplicateGroups;
        }),

    bulkUpdateUnits: publicProcedure
        .input(z.object({
            updates: z.array(z.object({
                id: z.string().uuid(),
                unit: z.string().trim().min(1),
            })),
        }))
        .output(z.object({ count: z.number().int() }))
        .mutation(async ({ input }) => {
            let count = 0;

            for (const update of input.updates) {
                try {
                    await prisma.ingredient.update({
                        where: { id: update.id },
                        data: { unit: update.unit },
                    });
                    count++;
                } catch (e: unknown) {
                    // Skip ingredients that don't exist or other errors
                    // In production, consider using a proper logging library
                }
            }

            return { count };
        }),

    listWithoutCategory: publicProcedure
        .output(z.array(IngredientListItem))
        .query(async () => {
            const items = await prisma.ingredient.findMany({
                orderBy: { name: "asc" },
                include: { _count: { select: { recipes: true } } },
            });
            return items
                .map((i) => ({
                    id: i.id,
                    name: i.name,
                    unit: i.unit ?? undefined,
                    usageCount: i._count.recipes,
                    isPantryItem: i.isPantryItem,
                    category: normalizeIngredientCategory(i.category),
                }))
                .filter((i) => i.category === "ANNET");
        }),

    bulkUpdateCategories: publicProcedure
        .input(z.object({
            updates: z.array(z.object({
                id: z.string().uuid(),
                category: IngredientCategory,
            })),
        }))
        .output(z.object({ count: z.number().int() }))
        .mutation(async ({ input }) => {
            let count = 0;

            for (const update of input.updates) {
                try {
                    await prisma.ingredient.update({
                        where: { id: update.id },
                        data: { category: update.category as any },
                    });
                    count++;
                } catch (e: unknown) {
                    // Skip ingredients that don't exist or other errors
                }
            }

            return { count };
        }),

    create: publicProcedure
        .input(IngredientCreate)
        .output(z.object({ id: z.string().uuid(), name: z.string(), unit: z.string().optional(), isPantryItem: z.boolean(), category: IngredientCategory }))
        .mutation(async ({ input }) => {
            try {
                const trimmedName = input.name.trim();
                const up = await prisma.ingredient.upsert({
                    where: { name: trimmedName },
                    update: {
                        unit: input.unit?.trim() ?? null,
                        isPantryItem: Boolean(input.isPantryItem),
                        ...(input.category ? { category: input.category as any } : {}),
                    },
                    create: {
                        name: trimmedName,
                        unit: input.unit?.trim() ?? null,
                        isPantryItem: Boolean(input.isPantryItem),
                        ...(input.category ? { category: input.category as any } : {}),
                    },
                });
                return { id: up.id, name: up.name, unit: up.unit ?? undefined, isPantryItem: up.isPantryItem, category: normalizeIngredientCategory(up.category) };
            } catch (e: any) {
                throw new TRPCError({ code: "BAD_REQUEST", message: e?.message ?? "Failed to create ingredient" });
            }
        }),

    update: publicProcedure
        .input(IngredientUpdate)
        .output(z.object({ id: z.string().uuid(), name: z.string(), unit: z.string().optional(), isPantryItem: z.boolean(), category: IngredientCategory }))
        .mutation(async ({ input }) => {
            try {
                const trimmedName = input.name.trim();
                const updated = await prisma.ingredient.update({
                    where: { id: input.id },
                    data: {
                        name: trimmedName,
                        unit: input.unit?.trim() ?? null,
                        ...(typeof input.isPantryItem === "boolean" ? { isPantryItem: input.isPantryItem } : {}),
                        ...(input.category ? { category: input.category as any } : {}),
                    },
                });
                return { id: updated.id, name: updated.name, unit: updated.unit ?? undefined, isPantryItem: updated.isPantryItem, category: normalizeIngredientCategory(updated.category) };
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
                category: normalizeIngredientCategory(ing.category),
                recipes: ing.recipes.map((ri) => ({
                    id: ri.recipe.id,
                    name: ri.recipe.name,
                    category: ri.recipe.category,
                    everydayScore: ri.recipe.everydayScore,
                    healthScore: ri.recipe.healthScore,
                })),
            };
        }),

    merge: publicProcedure
        .input(z.object({
            keepId: z.string().uuid(),
            mergeIds: z.array(z.string().uuid()).min(1),
        }))
        .output(z.object({ mergedCount: z.number().int(), updatedRecipes: z.number().int() }))
        .mutation(async ({ input }) => {
            const { keepId, mergeIds } = input;
            const uniqueMergeIds = [...new Set(mergeIds.filter((id) => id !== keepId))];
            if (uniqueMergeIds.length === 0) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "No ingredients to merge" });
            }

            // Verify the keep ingredient exists
            const keep = await prisma.ingredient.findUnique({ where: { id: keepId } });
            if (!keep) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Keep ingredient not found" });
            }

            let updatedRecipes = 0;

            await prisma.$transaction(async (tx) => {
                // Find all recipe-ingredient links for the ingredients being merged
                const mergeLinks = await tx.recipeIngredient.findMany({
                    where: { ingredientId: { in: uniqueMergeIds } },
                });

                // Find existing links for the keep ingredient to avoid duplicates
                const keepLinks = await tx.recipeIngredient.findMany({
                    where: { ingredientId: keepId },
                });
                const keepRecipeIds = new Set(keepLinks.map((l) => l.recipeId));

                for (const link of mergeLinks) {
                    if (keepRecipeIds.has(link.recipeId)) {
                        // Recipe already has the keep ingredient — delete the duplicate link
                        await tx.recipeIngredient.delete({
                            where: {
                                recipeId_ingredientId: {
                                    recipeId: link.recipeId,
                                    ingredientId: link.ingredientId,
                                },
                            },
                        });
                    } else {
                        // Re-point the link to the keep ingredient
                        await tx.recipeIngredient.update({
                            where: {
                                recipeId_ingredientId: {
                                    recipeId: link.recipeId,
                                    ingredientId: link.ingredientId,
                                },
                            },
                            data: { ingredientId: keepId },
                        });
                        keepRecipeIds.add(link.recipeId);
                        updatedRecipes++;
                    }
                }

                // Delete the merged ingredients
                await tx.ingredient.deleteMany({
                    where: { id: { in: uniqueMergeIds } },
                });
            });

            return { mergedCount: uniqueMergeIds.length, updatedRecipes };
        }),
});
