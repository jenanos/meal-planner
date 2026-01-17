"use client";

import { Button, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@repo/ui";
import { makeDragId } from "../utils";
import type { RecipeDTO, WeekState, DayName } from "../types";
import { WeekSlot } from "./WeekSlot";
import { DraggableRecipe } from "./DraggableRecipe";
import { SuggestionCard } from "./SuggestionCard";
import { SearchSection } from "./SearchSection";

export type MobileEditorProps = {
  week: WeekState;
  dayNames: readonly DayName[];
  longGap: RecipeDTO[];
  frequent: RecipeDTO[];
  searchTerm: string;
  searchResults: RecipeDTO[];
  searchLoading: boolean;
  searchError: string | null;
  mobileEditorView: "frequent" | "longGap" | "search";
  isMobileEditorOpen: boolean;
  onToggleEditor: (_open: boolean) => void;
  onChangeView: (_view: "frequent" | "longGap" | "search") => void;
  onSearchTermChange: (_value: string) => void;
  onPickFromSource: (
    _source: "longGap" | "frequent" | "search",
    _recipe: RecipeDTO
  ) => Promise<void> | void;
  onRecipeClick?: (_recipe: RecipeDTO) => void;
  onSetTakeaway?: (_index: number) => void;
  onClearEntry?: (_index: number) => void;
};

export function MobileEditor({
  week,
  dayNames,
  longGap,
  frequent,
  searchTerm,
  searchResults,
  searchLoading,
  searchError,
  mobileEditorView,
  isMobileEditorOpen,
  onToggleEditor,
  onChangeView,
  onSearchTermChange,
  onPickFromSource,
  onRecipeClick,
  onSetTakeaway,
  onClearEntry,
}: MobileEditorProps) {
  if (!isMobileEditorOpen) {
    return (
      <div className="space-y-3">
        <div className="flex flex-col gap-2">
          {week.map((entry, index) => (
            <WeekSlot
              key={index}
              index={index}
              dayName={dayNames[index]}
              entry={entry}
              onRecipeClick={onRecipeClick}
              onSetTakeaway={onSetTakeaway}
              onClearEntry={onClearEntry}
            />
          ))}
        </div>
        <Button
          type="button"
          className="w-full"
          onClick={() => {
            onChangeView("frequent");
            onToggleEditor(true);
          }}
        >
          Trykk her for å endre ukesplanen
        </Button>
      </div>
    );
  }

  const suggestions = mobileEditorView === "longGap" ? longGap : frequent;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          {week.map((entry, index) => (
            <WeekSlot
              key={index}
              index={index}
              dayName={dayNames[index]}
              entry={entry}
              onRecipeClick={onRecipeClick}
              onSetTakeaway={onSetTakeaway}
              onClearEntry={onClearEntry}
            />
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-center gap-2">
            <label htmlFor="mobile-editor-source" className="text-sm font-medium text-center">
              Velg forslag
            </label>
          </div>

          <Select value={mobileEditorView} onValueChange={(v) => onChangeView(v as typeof mobileEditorView)}>
            <SelectTrigger id="mobile-editor-source" className="w-full">
              <SelectValue placeholder="Velg forslag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="frequent">Ofte brukt</SelectItem>
              <SelectItem value="longGap">Lenge siden sist</SelectItem>
              <SelectItem value="search">Søk</SelectItem>
            </SelectContent>
          </Select>

          {mobileEditorView === "search" ? (
            <SearchSection
              layout="list"
              searchTerm={searchTerm}
              onSearchTermChange={onSearchTermChange}
              searchLoading={searchLoading}
              searchError={searchError}
              searchResults={searchResults}
              onPick={(recipe) => onPickFromSource("search", recipe)}
            />
          ) : (
            <div className="flex flex-col gap-2">
              {suggestions.length ? (
                suggestions.map((recipe, index) => {
                  return (
                    <DraggableRecipe
                      key={recipe.id}
                      id={makeDragId({ source: mobileEditorView, index, recipeId: recipe.id })}
                    >
                      {({ setNodeRef, listeners, attributes, style, isDragging }) => (
                        <div ref={setNodeRef} style={style} data-dragging={isDragging ? "true" : "false"} {...listeners} {...attributes}>
                          <SuggestionCard
                            recipe={recipe}
                            source={mobileEditorView}
                            index={index}
                            onPick={() => {
                              onPickFromSource(mobileEditorView, recipe);
                            }}
                          />
                        </div>
                      )}
                    </DraggableRecipe>
                  );
                })
              ) : (
                <p className="text-sm text-gray-500">Ingen forslag akkurat nå</p>
              )}
            </div>
          )}
        </div>
      </div>
      <Button type="button" variant="ghost" className="w-full" onClick={() => onToggleEditor(false)}>
        Ferdig med endringer
      </Button>
    </div>
  );
}
