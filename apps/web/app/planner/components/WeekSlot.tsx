"use client";

import { useDroppable } from "@dnd-kit/core";
import type { RecipeDTO, DayName } from "../types";
import { makeDragId } from "../utils";
import { WeekCard } from "./WeekCard";
import { DraggableRecipe } from "./DraggableRecipe";

// DayName imported from shared types

type WeekSlotProps = {
  index: number;
  dayName: DayName;
  recipe: RecipeDTO | null;
  onRecipeClick?: (_recipe: RecipeDTO) => void;
};

export function WeekSlot({ index, dayName, recipe, onRecipeClick }: WeekSlotProps) {
  // Use the same format as draggable IDs so parseDragId works
  const dropId = makeDragId({ source: "week", index, recipeId: recipe?.id || "empty" });
  const { isOver, setNodeRef } = useDroppable({ id: dropId });

  if (!recipe) {
    return (
      <div ref={setNodeRef}>
        <WeekCard index={index} dayName={dayName} recipe={null} isDraggingTarget={isOver} />
      </div>
    );
  }

  return (
    <div ref={setNodeRef}>
      <DraggableRecipe id={makeDragId({ source: "week", index, recipeId: recipe.id })}>
        {({ setNodeRef: setDragRef, listeners, attributes, style, isDragging }) => (
          <div ref={setDragRef} style={style} {...listeners} {...attributes} data-dragging={isDragging ? "true" : "false"}>
            <WeekCard
              index={index}
              dayName={dayName}
              recipe={recipe}
              isDraggingTarget={isOver}
              onClick={onRecipeClick ? () => onRecipeClick(recipe) : undefined}
            />
          </div>
        )}
      </DraggableRecipe>
    </div>
  );
}
