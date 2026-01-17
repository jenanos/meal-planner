import type { MockWeekPlanResult } from "../../lib/mock/store";

export type WeekPlanResult = MockWeekPlanResult;
export type WeekDay = WeekPlanResult["days"][number];
export type WeekRecipe = WeekDay["recipe"];
export type RecipeDTO = NonNullable<WeekRecipe>;
export type WeekEntry =
  | { type: "RECIPE"; recipe: RecipeDTO }
  | { type: "TAKEAWAY" };
export type WeekState = (WeekEntry | null)[];

export type DragSource = "week" | "longGap" | "frequent" | "search";
export type DragPayload = { source: DragSource; index: number; recipeId: string };

export type TimelineWeek = { weekStart: string; hasEntries: boolean; label: string };
export type TimelineWeekEntry = { week: TimelineWeek | null; index: number | null };

// Shared day name union used by planner components
export type DayName =
	| "Mandag"
	| "Tirsdag"
	| "Onsdag"
	| "Torsdag"
	| "Fredag"
	| "Lørdag"
	| "Søndag";
