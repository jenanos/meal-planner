"use client";

import { useRef } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@repo/ui";

import { describeEveryday, describeHealth } from "../../../lib/scoreLabels";
import { CATEGORY_LABELS, CategoryEmoji } from "../../components/CategoryEmoji";
import { Sheet } from "../../components/Sheet";
import type { RecipeDialogState } from "../hooks/useRecipeDialogState";

const quantityFormat = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 });

type ViewIngredient = {
  ingredientId?: string;
  name: string;
  quantity?: number | string | null;
  unit?: string | null;
  notes?: string | null;
};

function formatAmount(ingredient: ViewIngredient) {
  const { quantity, unit } = ingredient;
  const amount =
    quantity == null || quantity === ""
      ? ""
      : typeof quantity === "number"
        ? quantityFormat.format(quantity)
        : String(quantity);
  return [amount, unit].filter(Boolean).join(" ");
}

/** A recipe laid out as one scrolling page: facts, ingredients, method. */
export function RecipeViewSheet({ state }: { state: RecipeDialogState }) {
  const { isViewDialogOpen, onViewOpenChange, viewRecipe, startEditFromView } = state;

  // Hold on to the recipe while the sheet animates away.
  const lastRecipe = useRef(viewRecipe);
  if (viewRecipe) lastRecipe.current = viewRecipe;
  const recipe = viewRecipe ?? lastRecipe.current;

  const ingredients = (recipe?.ingredients ?? []) as ViewIngredient[];
  const categoryKey = (recipe?.category ?? "").toUpperCase();

  return (
    <Sheet
      open={isViewDialogOpen}
      onClose={() => onViewOpenChange(false)}
      title={recipe?.name ?? "Oppskrift"}
      hideTitle
      dismissIcon="back"
      action={
        recipe ? (
          <Button
            type="button"
            variant="ghost"
            className="h-11 gap-2 rounded-full px-4 text-primary hover:text-primary"
            onClick={() => startEditFromView(recipe.id)}
          >
            <Pencil className="size-4" aria-hidden="true" />
            Rediger
          </Button>
        ) : null
      }
    >
      {recipe ? (
        <article className="space-y-7">
          <header className="space-y-3">
            <h2 className="text-balance text-2xl font-bold leading-tight tracking-tight">
              {recipe.name}
            </h2>
            <ul className="flex flex-wrap gap-2 text-sm">
              {recipe.category ? (
                <li className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-3 py-1">
                  <CategoryEmoji category={recipe.category} size={9} showSrLabel={false} />
                  {CATEGORY_LABELS[categoryKey] ?? "Annet"}
                </li>
              ) : null}
              <li className="rounded-full bg-muted/70 px-3 py-1">
                {describeEveryday(recipe.everydayScore)}
              </li>
              <li className="rounded-full bg-muted/70 px-3 py-1">
                {describeHealth(recipe.healthScore)}
              </li>
              {recipe.servings ? (
                <li className="rounded-full bg-muted/70 px-3 py-1">
                  {recipe.servings === 1 ? "1 porsjon" : `${recipe.servings} porsjoner`}
                </li>
              ) : null}
            </ul>
          </header>

          <section aria-labelledby="recipe-view-ingredients" className="space-y-2">
            <h3
              id="recipe-view-ingredients"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Ingredienser
              {ingredients.length > 0 ? (
                <span className="ml-1.5 font-normal normal-case tracking-normal">
                  ({ingredients.length})
                </span>
              ) : null}
            </h3>
            {ingredients.length > 0 ? (
              <ul className="divide-y divide-border/40">
                {ingredients.map((ingredient, index) => (
                  <li
                    key={ingredient.ingredientId ?? `${ingredient.name}-${index}`}
                    className="grid grid-cols-[4.75rem_1fr] gap-x-3 py-2.5 text-base leading-snug"
                  >
                    <span className="text-right font-semibold tabular-nums text-primary">
                      {formatAmount(ingredient)}
                    </span>
                    <span className="min-w-0">
                      <span className="break-words">{ingredient.name}</span>
                      {ingredient.notes ? (
                        <span className="block text-sm text-muted-foreground">
                          {ingredient.notes}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Ingen ingredienser registrert.</p>
            )}
          </section>

          <section aria-labelledby="recipe-view-description" className="space-y-2">
            <h3
              id="recipe-view-description"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Beskrivelse
            </h3>
            {recipe.description ? (
              <p className="whitespace-pre-line text-base leading-relaxed">
                {recipe.description}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Ingen beskrivelse lagt inn.</p>
            )}
          </section>
        </article>
      ) : (
        <p className="text-sm text-muted-foreground">Kunne ikke finne oppskriften.</p>
      )}
    </Sheet>
  );
}
