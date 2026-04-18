import type { RouterOutputs } from "../../lib/trpcTypes";

export type RecipeListItem = RouterOutputs["recipe"]["list"]["items"][number];

export type IngredientSuggestion = RouterOutputs["ingredient"]["list"][number];

export type FormIngredient = {
  id?: string;
  name: string;
  unit?: string;
  isPantryItem?: boolean;
  quantity?: string | number;
  notes?: string;
};
