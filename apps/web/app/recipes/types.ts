import type { MockIngredientListResult, MockRecipeListResult } from "../../lib/mock/store";

export type RecipeListItem = MockRecipeListResult["items"][number];

export type IngredientSuggestion = MockIngredientListResult[number];

export type FormIngredient = {
  id?: string;
  name: string;
  unit?: string;
  quantity?: string | number;
  notes?: string;
};
