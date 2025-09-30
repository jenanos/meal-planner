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
};

export function WeekSlot({ index, dayName, recipe }: WeekSlotProps) {
  const { isOver, setNodeRef } = useDroppable({ id: `day-${index}` });

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
        {({ setNodeRef: setDragRef, listeners, attributes, style }) => (
          <div ref={setDragRef} style={style} {...listeners} {...attributes}>
            <WeekCard index={index} dayName={dayName} recipe={recipe} isDraggingTarget={isOver} />
          </div>
        )}
      </DraggableRecipe>
    </div>
  );
}
