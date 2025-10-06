import { z } from "zod";
// (Hvis ikke allerede definert)
export const Category = z.enum(["FISK", "VEGETAR", "KYLLING", "STORFE", "ANNET"]);
export const IngredientCreate = z.object({
    name: z.string().min(1),
    unit: z.string().min(1).optional(),
});
export const IngredientById = z.object({
    id: z.string().uuid(),
});
export const IngredientListQuery = z.object({
    search: z.string().optional(),
});
// (Hvis ikke allerede finnes)
export const RecipeCreate = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    category: Category,
    everydayScore: z.number().int().min(1).max(5),
    healthScore: z.number().int().min(1).max(5),
    ingredients: z.array(z.object({
        name: z.string().min(1),
        quantity: z.union([z.number(), z.string()]).optional(),
        unit: z.string().min(1).optional(),
        notes: z.string().min(1).optional(),
    })).default([]),
});
export const RecipeUpdate = RecipeCreate.extend({
    id: z.string().uuid(),
});
export const RecipeListQuery = z.object({
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(1000).default(20),
    category: Category.optional(),
    search: z.string().optional(),
});
export const PlannerConstraints = z.object({
    fish: z.number().int().min(0).default(2),
    vegetarian: z.number().int().min(0).default(3),
    chicken: z.number().int().min(0).default(1),
    beef: z.number().int().min(0).default(1),
    preferRecentGapDays: z.number().int().min(0).default(21),
});
export const WeekPlanInput = z.object({
    weekStart: z.string().min(1),
    recipeIdsByDay: z.array(z.string().uuid().nullable()).length(7),
});
// Extra shopping items
export const ExtraItemUpsert = z.object({
    name: z.string().min(1),
});
export const ExtraItemSuggest = z.object({
    search: z.string().optional(),
});
export const ExtraShoppingToggle = z.object({
    weekStart: z.string().min(1),
    name: z.string().min(1),
    checked: z.boolean().optional(),
});
export const ExtraShoppingRemove = z.object({
    weekStart: z.string().min(1),
    name: z.string().min(1),
});
