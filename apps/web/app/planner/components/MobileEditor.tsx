"use client";

import type { RecipeDTO, WeekState, DayName } from "../types";
import { WeekSlot } from "./WeekSlot";

export type MobileEditorProps = {
  week: WeekState;
  dayNames: readonly DayName[];
  onRequestChange: (dayIndex: number) => void;
  onSetTakeaway?: (index: number) => void;
  onClearEntry?: (index: number) => void;
};

/**
 * Simplified mobile editor that shows the week plan.
 * Tapping a slot opens the RecipePickerModal (handled by parent).
 * Drag-drop is handled by DndContext in page.tsx for reordering.
 */
export function MobileEditor({
  week,
  dayNames,
  onRequestChange,
  onSetTakeaway,
  onClearEntry,
}: MobileEditorProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2">
        {week.map((entry, index) => (
          <WeekSlot
            key={index}
            index={index}
            dayName={dayNames[index]}
            entry={entry}
            onRequestChange={onRequestChange}
            onSetTakeaway={onSetTakeaway}
            onClearEntry={onClearEntry}
          />
        ))}
      </div>
    </div>
  );
}
