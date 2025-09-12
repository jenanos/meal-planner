import { z } from "zod";

export const Diet = z.enum(["MEAT", "FISH", "VEG"]);

export const RecipeCreate = z.object({
  householdId: z.string().uuid(),
  title: z.string().min(2),
  diet: Diet,
});

export const RecipeListQuery = z.object({
  householdId: z.string().uuid(),
  diet: Diet.optional(),
  search: z.string().optional(),
});

export const Weekday = z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);

export const PlannerInput = z.object({
  householdId: z.string().uuid(),
  weekStart: z.string().datetime(),
  weeklyTargets: z.object({
    MEAT: z.number(),
    FISH: z.number(),
    VEG: z.number(),
  }),
});

export const SaveWeekInput = z.object({
  householdId: z.string().uuid(),
  weekStart: z.string().datetime(),
  items: z.array(
    z.object({
      day: Weekday,
      recipeId: z.string().uuid().nullable(),
    })
  ),
});

export type PlannerWeekItem = {
  day: z.infer<typeof Weekday>;
  recipeId: string | null;
  title: string;
  diet: z.infer<typeof Diet>;
};

