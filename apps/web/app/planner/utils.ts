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
  return `${payload.source}:${payload.index}:${payload.recipeId}`;
}

export function parseDragId(id: string): DragPayload | null {
  const [source, indexStr, recipeId] = id.split(":");
  const dragSource = source as DragSource;
  if (
    (dragSource === "week" || dragSource === "longGap" || dragSource === "frequent" || dragSource === "search") &&
    Number.isFinite(Number(indexStr)) &&
    recipeId
  ) {
    return { source: dragSource, index: Number(indexStr), recipeId };
  }
  return null;
}
