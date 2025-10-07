"use client";

import { Input } from "@repo/ui";
import type { RecipeDTO } from "../types";
import { DraggableRecipe } from "./DraggableRecipe";
import { SuggestionCard } from "./SuggestionCard";

export type SearchSectionProps = {
  searchTerm: string;
  onSearchTermChange: (_value: string) => void;
  searchLoading: boolean;
  searchError: string | null;
  searchResults: RecipeDTO[];
  selectedIdSet: Set<string>;
  onPick: (_recipe: RecipeDTO) => Promise<void> | void;
  layout?: "grid" | "list";
  title?: string;
};

export function SearchSection({
  searchTerm,
  onSearchTermChange,
  searchLoading,
  searchError,
  searchResults,
  selectedIdSet,
  onPick,
  layout = "grid",
  title,
}: SearchSectionProps) {
  const resultsContainerClass =
    layout === "grid"
      ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2 justify-items-center"
      : "flex flex-col gap-2";

  return (
    <section className="space-y-3">
      {layout === "grid" ? (
        <div className="flex flex-col items-center gap-2">
          {title ? <label className="text-sm text-center">{title}</label> : null}
          <div className="w-full flex justify-center">
            <div className="w-full max-w-md">
              <Input
                placeholder="Søk etter oppskrifter"
                value={searchTerm}
                onChange={(event) => onSearchTermChange(event.target.value)}
              />
              {searchLoading ? (
                <p className="mt-1 text-xs text-center text-muted-foreground">Søker…</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            placeholder="Søk etter oppskrifter"
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
          />
          {searchLoading ? (
            <p className="text-xs text-center text-muted-foreground">Søker…</p>
          ) : null}
        </div>
      )}

      {searchError ? <p className="text-sm text-red-500 text-center">{searchError}</p> : null}

      <div className={resultsContainerClass}>
        {searchResults.length
          ? searchResults.map((recipe, index) => {
              const draggableId = `search-${recipe.id}-${index}`;
              return (
                <DraggableRecipe key={draggableId} id={draggableId} data={{ source: "search", index, recipe }}>
                  {({ setNodeRef, listeners, attributes, style, isDragging }) => (
                    <div ref={setNodeRef} style={style} data-dragging={isDragging ? "true" : undefined} {...listeners} {...attributes}>
                      <SuggestionCard
                        recipe={recipe}
                        source="search"
                        index={index}
                        isInWeek={selectedIdSet.has(recipe.id)}
                        onPick={() => onPick(recipe)}
                      />
                    </div>
                  )}
                </DraggableRecipe>
              );
            })
          : null}
      </div>
    </section>
  );
}
