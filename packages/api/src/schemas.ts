import { z } from "zod";

export const Category = z.enum(["FISK", "VEGETAR", "KYLLING", "STORFE", "ANNET"]);
export type Category = z.infer<typeof Category>;

export const IngredientInput = z.object({
  name: z.string().min(1),
  quantity: z.union([z.number(), z.string()]).optional(), // lagres som string på Decimal
  unit: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
});
export type IngredientInput = z.infer<typeof IngredientInput>;

export const RecipeCreate = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: Category,
  everydayScore: z.number().int().min(1).max(5),
  healthScore: z.number().int().min(1).max(5),
  ingredients: z.array(IngredientInput).default([]),
});
export type RecipeCreate = z.infer<typeof RecipeCreate>;

export const RecipeUpdate = RecipeCreate.extend({
  id: z.string().uuid(),
});
export type RecipeUpdate = z.infer<typeof RecipeUpdate>;

export const RecipeListQuery = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  category: Category.optional(),
  search: z.string().optional(),
});
export type RecipeListQuery = z.infer<typeof RecipeListQuery>;

export const PlannerConstraints = z.object({
  fish: z.number().int().min(0).default(2),
  vegetarian: z.number().int().min(0).default(3),
  chicken: z.number().int().min(0).default(1),
  beef: z.number().int().min(0).default(1),
  preferRecentGapDays: z.number().int().min(0).default(21),
});
export type PlannerConstraints = z.infer<typeof PlannerConstraints>;

export const WeekPlanInput = z.object({
  weekStart: z.string().min(1), // ISO
  recipeIdsByDay: z.array(z.string().uuid()).length(7),
});
export type WeekPlanInput = z.infer<typeof WeekPlanInput>;

