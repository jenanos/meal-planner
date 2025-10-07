import type { RecipeDTO, WeekState } from "./types";

export function makeEmptyWeek(): WeekState {
  return Array<RecipeDTO | null>(7).fill(null);
}

export function lowerIdSet(list: RecipeDTO[]): Set<string> {
  return new Set(list.map((recipe) => recipe.id));
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
