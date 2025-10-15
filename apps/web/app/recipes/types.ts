import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";

export type RecipeListItem = inferRouterOutputs<AppRouter>["recipe"]["list"]["items"][number];

export type IngredientSuggestion = inferRouterOutputs<AppRouter>["ingredient"]["list"][number];

export type FormIngredient = {
  name: string;
  unit?: string;
  quantity?: string | number;
  notes?: string;
};
