"use client";

import { ChevronLeft } from "lucide-react";
import {
  SHOPPING_HORIZONS,
  SHOPPING_HORIZON_LABELS,
  type ShoppingHorizon,
} from "../../../lib/shopping";

export type ShoppingListWindowDay = {
  key: string;
  label: string;
  title: string;
  selected: boolean;
  isPast: boolean;
};

interface ShoppingListWindowBarProps {
  horizon: ShoppingHorizon;
  onHorizonChange: (_horizon: ShoppingHorizon) => void;
  days: ShoppingListWindowDay[];
  onToggleDay: (_key: string, _selected: boolean) => void;
  /** Earlier days this week have planned meals that are hidden by default. */
  hasPastDays: boolean;
  showPastDays: boolean;
  onShowPastDaysChange: (_show: boolean) => void;
}

const CHIP_BASE =
  "shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CHIP_ON = "border-primary bg-primary/10 text-primary font-medium";
const CHIP_OFF =
  "border-input bg-transparent text-muted-foreground hover:bg-accent";

/**
 * Chooses which days the shopping list covers: how far ahead of today to shop
 * for, with each planned day in that window as a chip that can be tapped off.
 */
export function ShoppingListWindowBar({
  horizon,
  onHorizonChange,
  days,
  onToggleDay,
  hasPastDays,
  showPastDays,
  onShowPastDaysChange,
}: ShoppingListWindowBarProps) {
  return (
    <div className="space-y-2">
      <div
        role="radiogroup"
        aria-label="Handle for"
        className="grid grid-cols-5 gap-1 rounded-lg border bg-muted/40 p-1"
      >
        {SHOPPING_HORIZONS.map((option) => {
          const active = option === horizon;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onHorizonChange(option)}
              className={`rounded-md px-1 py-1.5 text-xs whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active
                  ? "bg-background font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {SHOPPING_HORIZON_LABELS[option]}
            </button>
          );
        })}
      </div>

      {days.length > 0 || hasPastDays ? (
        <div className="flex flex-wrap gap-1.5">
          {hasPastDays ? (
            <button
              type="button"
              aria-pressed={showPastDays}
              onClick={() => onShowPastDaysChange(!showPastDays)}
              className={`${CHIP_BASE} inline-flex items-center gap-1 ${
                showPastDays ? CHIP_ON : `${CHIP_OFF} border-dashed`
              }`}
            >
              <ChevronLeft className="h-3 w-3" />
              Tidligere
            </button>
          ) : null}
          {days.map((day) => (
            <button
              key={day.key}
              type="button"
              aria-pressed={day.selected}
              title={day.title}
              onClick={() => onToggleDay(day.key, !day.selected)}
              className={`${CHIP_BASE} ${
                day.selected ? CHIP_ON : `${CHIP_OFF} line-through`
              }`}
            >
              {day.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
