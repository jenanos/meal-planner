"use client";

import type { WeekState, DayName } from "../types";
import { WeekSlot } from "./WeekSlot";
import { toRealIndex } from "../utils";

export type MobileEditorProps = {
  week: WeekState;
  dayNames: readonly DayName[];
  startDay?: number;
  weekOffset?: number;
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
  startDay = 0,
  weekOffset = 0,
  onRequestChange,
  onSetTakeaway,
  onClearEntry,
}: MobileEditorProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2">
        {week.map((entry, displayIdx) => {
          const realIdx = toRealIndex(displayIdx, startDay);
          return (
            <WeekSlot
              key={`${weekOffset}-${realIdx}`}
              index={realIdx}
              dayName={dayNames[displayIdx]}
              entry={entry}
              weekOffset={weekOffset}
              onRequestChange={onRequestChange}
              onSetTakeaway={onSetTakeaway}
              onClearEntry={onClearEntry}
            />
          );
        })}
      </div>
    </div>
  );
}
