"use client";

import { Button } from "@repo/ui";
import type { RecipeDTO } from "../types";
import { makeDragId } from "../utils";
import { DraggableRecipe } from "./DraggableRecipe";
import { SuggestionCard } from "./SuggestionCard";

export type SuggestionSectionProps = {
  title: string;
  recipes: RecipeDTO[];
  source: "longGap" | "frequent";
  selectedIdSet: Set<string>;
  onRefresh: () => void;
  onPick: (_recipe: RecipeDTO) => Promise<void> | void;
  emptyText?: string;
  layout?: "grid" | "list";
};

export function SuggestionSection({
  title,
  recipes,
  source,
  selectedIdSet,
  onRefresh,
  onPick,
  emptyText = "Ingen forslag akkurat nå",
  layout = "grid",
}: SuggestionSectionProps) {
  const containerClass =
    layout === "grid"
      ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2 justify-items-center"
      : "flex flex-col gap-2";

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <Button type="button" variant="outline" onClick={onRefresh}>
          Oppdater
        </Button>
      </div>
      <div className={containerClass}>
        {recipes.length ? (
          recipes.map((recipe, index) => (
            <DraggableRecipe key={recipe.id} id={makeDragId({ source, index, recipeId: recipe.id })}>
              {({ setNodeRef, listeners, attributes, style }) => (
                <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
                  <SuggestionCard
                    recipe={recipe}
                    source={source}
                    index={index}
                    isInWeek={selectedIdSet.has(recipe.id)}
                    onPick={() => onPick(recipe)}
                  />
                </div>
              )}
            </DraggableRecipe>
          ))
        ) : (
          <p className="text-sm text-gray-500">{emptyText}</p>
        )}
      </div>
    </section>
  );
}
