"use client";

import { useDroppable } from "@dnd-kit/core";
import type { RecipeDTO, DayName } from "../types";
import { WeekCard } from "./WeekCard";
import { DraggableRecipe } from "./DraggableRecipe";

type WeekSlotDroppableData = {
  type: "week-slot";
  index: number;
};

// DayName imported from shared types

type WeekSlotProps = {
  index: number;
  dayName: DayName;
  recipe: RecipeDTO | null;
};

export function WeekSlot({ index, dayName, recipe }: WeekSlotProps) {
  const droppableId = `week-slot-${index}`;
  const { isOver, setNodeRef } = useDroppable<WeekSlotDroppableData>({
    id: droppableId,
    data: { type: "week-slot", index },
  });

  if (!recipe) {
    return (
      <div ref={setNodeRef} data-week-slot={index}>
        <WeekCard index={index} dayName={dayName} recipe={null} isDraggingTarget={isOver} />
      </div>
    );
  }

  const draggableId = `week-card-${index}`;

  return (
    <div ref={setNodeRef} data-week-slot={index}>
      <DraggableRecipe id={draggableId} data={{ source: "week", index, recipe }}>
        {({ setNodeRef: setDragRef, listeners, attributes, style, isDragging }) => (
          <div ref={setDragRef} style={style} {...listeners} {...attributes} data-dragging={isDragging ? "true" : undefined}>
            <WeekCard index={index} dayName={dayName} recipe={recipe} isDraggingTarget={isOver} />
          </div>
        )}
      </DraggableRecipe>
    </div>
  );
}
