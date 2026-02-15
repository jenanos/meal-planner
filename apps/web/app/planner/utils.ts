import type { DragPayload, DragSource, RecipeDTO, WeekEntry, WeekState } from "./types";

export function makeEmptyWeek(): WeekState {
  return Array<WeekEntry | null>(7).fill(null);
}

export function lowerIdSet(list: RecipeDTO[]): Set<string> {
  return new Set(list.map((recipe) => recipe.id));
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function makeDragId(payload: DragPayload) {
  const weekOffset = payload.weekOffset ?? 0;
  return `${payload.source}:${payload.index}:${payload.recipeId}:${weekOffset}`;
}

export function parseDragId(id: string): DragPayload | null {
  const parts = id.split(":");
  const [source, indexStr, recipeId] = parts;
  const weekOffset = parts.length > 3 ? Number(parts[3]) : 0;
  const dragSource = source as DragSource;
  if (
    (dragSource === "week" || dragSource === "longGap" || dragSource === "frequent" || dragSource === "search") &&
    Number.isFinite(Number(indexStr)) &&
    recipeId
  ) {
    return { source: dragSource, index: Number(indexStr), recipeId, weekOffset: Number.isFinite(weekOffset) ? weekOffset : 0 };
  }
  return null;
}

/** All 7 day names in standard (Monday-first) order */
export const ALL_DAY_NAMES = [
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
  "Søndag",
] as const;

/** Reorder day names so they start at `startDay` (0=Mon..6=Sun) */
export function reorderDayNames(startDay: number): typeof ALL_DAY_NAMES[number][] {
  return Array.from({ length: 7 }, (_, i) => ALL_DAY_NAMES[(startDay + i) % 7]);
}

/** Reorder a 7-element week array so slot 0 corresponds to `startDay` */
export function reorderWeek<T>(week: T[], startDay: number): T[] {
  if (startDay === 0 || week.length !== 7) return week;
  return [...week.slice(startDay), ...week.slice(0, startDay)];
}

/** Convert a display index back to the real (Mon=0) index given a startDay */
export function toRealIndex(displayIndex: number, startDay: number): number {
  return (displayIndex + startDay) % 7;
}
