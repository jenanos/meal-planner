"use client";

import type { RecipeDialogState } from "../hooks/useRecipeDialogState";
import { RecipeFormSheet } from "./RecipeFormSheet";
import { RecipeViewSheet } from "./RecipeViewSheet";

/** The view and edit sheets for the recipes held by `useRecipeDialogState`. */
export function RecipeSheets({ state }: { state: RecipeDialogState }) {
  return (
    <>
      <RecipeViewSheet state={state} />
      <RecipeFormSheet state={state} />
    </>
  );
}
