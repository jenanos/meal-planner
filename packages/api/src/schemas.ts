import { z } from "zod";

export const Diet = z.enum(["MEAT", "FISH", "VEG"]);
export type Diet = z.infer<typeof Diet>;

export const Day = z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
export type Day = z.infer<typeof Day>;

export const RecipeCreate = z.object({
  householdId: z.string().uuid(),
  title: z.string().min(1),
  diet: Diet,
});
export type RecipeCreate = z.infer<typeof RecipeCreate>;

export const RecipeListQuery = z.object({
  householdId: z.string().uuid(),
  diet: Diet.optional(),
  search: z.string().optional(),
});
export type RecipeListQuery = z.infer<typeof RecipeListQuery>;

export const PlannerInput = z.object({
  householdId: z.string().uuid(),
  weekStart: z.string(), // eller z.coerce.date()
  weeklyTargets: z.record(Diet, z.number().int().min(0)),
});
export type PlannerInput = z.infer<typeof PlannerInput>;

export const SaveWeekInput = z.object({
  householdId: z.string().uuid(),
  weekStart: z.string(),
  items: z.array(
    z.object({
      day: Day,
      recipeId: z.string().uuid().nullable(),
    })
  ),
});
export type SaveWeekInput = z.infer<typeof SaveWeekInput>;

