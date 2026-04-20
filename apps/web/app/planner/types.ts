import type { RouterOutputs } from "../../lib/trpcTypes";

export type WeekPlanResult = RouterOutputs["planner"]["getWeekPlan"];
export type WeekTimelineResult = RouterOutputs["planner"]["weekTimeline"];
export type WeekDay = WeekPlanResult["days"][number];
export type WeekRecipe = WeekDay["recipe"];
export type RecipeDTO = NonNullable<WeekRecipe>;
export type WeekEntry =
  | { type: "RECIPE"; recipe: RecipeDTO }
  | { type: "TAKEAWAY" }
  | { type: "FREEZER"; recipe: RecipeDTO };
export type WeekState = (WeekEntry | null)[];

export type DragSource = "week" | "longGap" | "frequent" | "search";
export type DragPayload = { source: DragSource; index: number; recipeId: string; weekOffset?: number };

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
