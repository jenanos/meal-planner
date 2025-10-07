"use client";

import type { RecipeDTO } from "../types";
import { DraggableRecipe } from "./DraggableRecipe";
import { SuggestionCard } from "./SuggestionCard";

export type SuggestionSectionProps = {
  title: string;
  recipes: RecipeDTO[];
  source: "longGap" | "frequent";
  selectedIdSet: Set<string>;
  onPick: (_recipe: RecipeDTO) => Promise<void> | void;
  emptyText?: string;
  layout?: "grid" | "list";
};

export function SuggestionSection({
  title,
  recipes,
  source,
  selectedIdSet,
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
      <h2 className="font-semibold text-center">{title}</h2>
      <div className={containerClass}>
        {recipes.length ? (
          recipes.map((recipe, index) => {
            const draggableId = `${source}-${recipe.id}-${index}`;
            return (
              <DraggableRecipe key={draggableId} id={draggableId} data={{ source, index, recipe }}>
                {({ setNodeRef, listeners, attributes, style, isDragging }) => (
                  <div
                    ref={setNodeRef}
                    style={style}
                    data-dragging={isDragging ? "true" : undefined}
                    {...listeners}
                    {...attributes}
                  >
                    <SuggestionCard
                      recipe={recipe}
                      source={source}
                      index={index}
                      isInWeek={selectedIdSet.has(recipe.id)}
                      onPick={() => {
                        if (isDragging) return; // don't trigger pick while dragging
                        onPick(recipe);
                      }}
                    />
                  </div>
                )}
              </DraggableRecipe>
            );
          })
        ) : (
          <p className="text-sm text-gray-500">{emptyText}</p>
        )}
      </div>
    </section>
  );
}
