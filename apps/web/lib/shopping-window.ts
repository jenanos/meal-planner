import { MS_PER_DAY, startOfWeekISO } from "./week";
import type { ShoppingHorizon } from "./shopping";

/**
 * The shopping list covers a rolling window that starts today and reaches as
 * far as the chosen horizon, independent of where the calendar week ends.
 *
 * Planned days are keyed by UTC midnight of their calendar date, so "today"
 * is the device's local date expressed the same way.
 */
export function localTodayMs(now: Date = new Date()) {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

export type ShoppingWindow = {
  /** UTC midnight of today's local date. */
  todayMs: number;
  /** Monday of the week today falls in. */
  weekStartISO: string;
  weekStartMs: number;
  /** Last day in the window, inclusive. */
  endMs: number;
  /** Weeks after the current one the window reaches into. */
  lookaheadWeeks: number;
};

export function resolveShoppingWindow(
  todayMs: number,
  horizon: ShoppingHorizon,
): ShoppingWindow {
  const weekStartISO = startOfWeekISO(new Date(todayMs));
  const weekStartMs = new Date(weekStartISO).getTime();
  const todayIndex = Math.round((todayMs - weekStartMs) / MS_PER_DAY);

  const daysAhead =
    horizon === "today"
      ? 0
      : horizon === "three-days"
        ? 2
        : horizon === "rest-of-week"
          ? 6 - todayIndex
          : horizon === "fourteen-days"
            ? 13
            : 6;

  return {
    todayMs,
    weekStartISO,
    weekStartMs,
    endMs: todayMs + daysAhead * MS_PER_DAY,
    lookaheadWeeks: Math.floor((todayIndex + daysAhead) / 7),
  };
}

type DayRef = { weekStart: string; dayIndex: number };

/** The shape of a shopping list item this module needs to narrow it. */
type NarrowableItem = {
  occurrences?: (DayRef & {
    quantity: number | null;
    hasMissingQuantities: boolean;
  })[];
  details?: DayRef[];
  weekStarts?: string[];
  totalQuantity: number | null;
  hasMissingQuantities: boolean;
};

export function dayKey(day: DayRef) {
  return `${day.weekStart}::${day.dayIndex}`;
}

/**
 * Cut every item down to the given days ("weekStart::dayIndex"): only the
 * occurrences and recipe details on those days remain, totals are recomputed
 * from them, and items with nothing left are dropped.
 */
export function narrowItemsToDays<T extends NarrowableItem>(
  items: readonly T[],
  visibleDayKeys: ReadonlySet<string>,
): T[] {
  const result: T[] = [];
  for (const item of items) {
    const occurrences = (item.occurrences ?? []).filter((occurrence) =>
      visibleDayKeys.has(dayKey(occurrence)),
    );
    if (!occurrences.length) continue;
    const hasQuantity = occurrences.some(
      (occurrence) => occurrence.quantity != null,
    );
    result.push({
      ...item,
      occurrences,
      details: (item.details ?? []).filter((detail) =>
        visibleDayKeys.has(dayKey(detail)),
      ),
      weekStarts: Array.from(
        new Set(occurrences.map((occurrence) => occurrence.weekStart)),
      ),
      totalQuantity: hasQuantity
        ? occurrences.reduce(
            (sum, occurrence) => sum + (occurrence.quantity ?? 0),
            0,
          )
        : null,
      hasMissingQuantities: occurrences.some(
        (occurrence) => occurrence.hasMissingQuantities,
      ),
    });
  }
  return result;
}
