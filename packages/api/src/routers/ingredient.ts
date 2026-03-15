import { prisma } from "@repo/database";
import { router, protectedProcedure } from "../trpc.js";
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
    list: protectedProcedure
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

    listWithoutUnit: protectedProcedure
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

    listPotentialDuplicates: protectedProcedure
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

    bulkUpdateUnits: protectedProcedure
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

    listWithoutCategory: protectedProcedure
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

    bulkUpdateCategories: protectedProcedure
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

    create: protectedProcedure
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

    update: protectedProcedure
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

    getWithRecipes: protectedProcedure
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
});
