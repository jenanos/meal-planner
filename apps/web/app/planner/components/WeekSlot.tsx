"use client";

import { useDroppable } from "@dnd-kit/core";
import type { DayName, RecipeDTO, WeekEntry } from "../types";
import { makeDragId } from "../utils";
import { WeekCard } from "./WeekCard";
import { DraggableRecipe } from "./DraggableRecipe";

type WeekSlotProps = {
  index: number;
  dayName: DayName;
  entry: WeekEntry | null;
  weekOffset?: number;
  onRecipeClick?: (_recipe: RecipeDTO) => void;
  onRequestChange?: (_index: number) => void;
  onSetTakeaway?: (_index: number) => void;
  onClearEntry?: (_index: number) => void;
};

export function WeekSlot({ index, dayName, entry, weekOffset = 0, onRecipeClick, onRequestChange, onSetTakeaway, onClearEntry }: WeekSlotProps) {
  const recipe = entry?.type === "RECIPE" ? entry.recipe : null;
  const entryKey = entry?.type === "TAKEAWAY" ? "takeaway" : recipe?.id || "empty";
  // Use the same format as draggable IDs so parseDragId works
  const dropId = makeDragId({ source: "week", index, recipeId: entryKey, weekOffset });
  const { isOver, setNodeRef } = useDroppable({ id: dropId });

  // Handler for click - use onRequestChange if available, otherwise onRecipeClick
  const handleClick = () => {
    if (onRequestChange) {
      onRequestChange(index);
    } else if (recipe && onRecipeClick) {
      onRecipeClick(recipe);
    }
  };

  if (!entry || entry.type === "TAKEAWAY") {
    return (
      <div ref={setNodeRef}>
        <WeekCard
          index={index}
          dayName={dayName}
          recipe={recipe}
          entryType={entry?.type ?? "EMPTY"}
          isDraggingTarget={isOver}
          onClick={onRequestChange ? handleClick : undefined}
          onSetTakeaway={onSetTakeaway ? () => onSetTakeaway(index) : undefined}
          onClearEntry={onClearEntry ? () => onClearEntry(index) : undefined}
        />
      </div>
    );
  }

  return (
    <div ref={setNodeRef}>
      <DraggableRecipe id={makeDragId({ source: "week", index, recipeId: entryKey, weekOffset })}>
        {({ setNodeRef: setDragRef, listeners, attributes, style, isDragging }) => (
          <div ref={setDragRef} style={style} {...listeners} {...attributes} data-dragging={isDragging ? "true" : "false"}>
            <WeekCard
              index={index}
              dayName={dayName}
              recipe={recipe}
              entryType="RECIPE"
              isDraggingTarget={isOver}
              onClick={handleClick}
              onSetTakeaway={onSetTakeaway ? () => onSetTakeaway(index) : undefined}
            />
          </div>
        )}
      </DraggableRecipe>
    </div>
  );
}

