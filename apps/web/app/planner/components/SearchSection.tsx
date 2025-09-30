"use client";

import { Button, Input } from "@repo/ui";
import type { RecipeDTO } from "../types";
import { makeDragId } from "../utils";
import { DraggableRecipe } from "./DraggableRecipe";
import { SuggestionCard } from "./SuggestionCard";

export type SearchSectionProps = {
  searchTerm: string;
  onSearchTermChange: (_value: string) => void;
  searchLoading: boolean;
  searchError: string | null;
  searchResults: RecipeDTO[];
  selectedIdSet: Set<string>;
  onSearch: () => void;
  onClear: () => void;
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
  onSearch,
  onClear,
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
        <div className="flex flex-col sm:flex-row sm:items-end sm:gap-3">
          <div className="flex-1 flex flex-col">
            {title ? <label className="text-sm">{title}</label> : null}
            <Input
              placeholder="For eksempel linsegryte"
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onSearch();
                }
              }}
            />
          </div>
          <div className="flex gap-2 mt-2 sm:mt-0">
            <Button type="button" onClick={onSearch} disabled={searchLoading}>
              {searchLoading ? "Søker…" : "Søk"}
            </Button>
            <Button type="button" variant="ghost" onClick={onClear}>
              Tøm
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            placeholder="For eksempel linsegryte"
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSearch();
              }
            }}
          />
          <div className="flex gap-2">
            <Button type="button" onClick={onSearch} disabled={searchLoading} className="flex-1">
              {searchLoading ? "Søker…" : "Søk"}
            </Button>
            <Button type="button" variant="ghost" onClick={onClear} className="flex-1">
              Tøm
            </Button>
          </div>
        </div>
      )}

      {searchError ? <p className="text-sm text-red-500">{searchError}</p> : null}

      <div className={resultsContainerClass}>
        {searchResults.length ? (
          searchResults.map((recipe, index) => (
            <DraggableRecipe key={recipe.id} id={makeDragId({ source: "search", index, recipeId: recipe.id })}>
              {({ setNodeRef, listeners, attributes, style }) => (
                <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
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
          ))
        ) : (
          !searchError && <p className="text-sm text-gray-500">Søk for å hente forslag</p>
        )}
      </div>
    </section>
  );
}
