"use client";

import { WeekSlot } from "./WeekSlot";
import type { WeekEntry, DayName, RecipeDTO } from "../types";

export type MobileEditorItem = {
  entry: WeekEntry | null;
  dayName: DayName;
  dateLabel?: string;
  realIdx: number;
  weekOffset: number;
};

export type MobileEditorProps = {
  items: MobileEditorItem[];
  onRequestChange: (dayIndex: number, weekOffset: number) => void;
  onSetTakeaway: (index: number, weekOffset: number) => void;
  onClearEntry: (index: number, weekOffset: number) => void;
  onRecipeClick?: (recipe: RecipeDTO) => void;
  /** User preference: tap opens the recipe, a button on the card opens the picker. */
  tapOpensRecipe?: boolean;
};

/**
 * Simplified mobile editor that shows the week plan.
 * Tapping a slot opens the RecipePickerModal (handled by parent), or the
 * recipe itself when the user has chosen that in settings.
 * Drag-drop is handled by DndContext in page.tsx for reordering.
 */
export function MobileEditor({
  items,
  onRequestChange,
  onSetTakeaway,
  onClearEntry,
  onRecipeClick,
  tapOpensRecipe = false,
}: MobileEditorProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <WeekSlot
            key={`${item.weekOffset}-${item.realIdx}`}
            index={item.realIdx}
            dayName={item.dayName}
            dateLabel={item.dateLabel}
            entry={item.entry}
            weekOffset={item.weekOffset}
            onRequestChange={(idx) => onRequestChange(idx, item.weekOffset)}
            onRecipeClick={onRecipeClick}
            tapOpensRecipe={tapOpensRecipe}
            onSetTakeaway={() => onSetTakeaway(item.realIdx, item.weekOffset)}
            onClearEntry={() => onClearEntry(item.realIdx, item.weekOffset)}
          />
        ))}
      </div>
    </div>
  );
}
