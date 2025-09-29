import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";

type PlannerOutputs = inferRouterOutputs<AppRouter>["planner"];
export type WeekPlanResult = PlannerOutputs["getWeekPlan"];
export type WeekDay = WeekPlanResult["days"][number];
export type WeekRecipe = WeekDay["recipe"];
export type RecipeDTO = NonNullable<WeekRecipe>;
export type WeekState = (RecipeDTO | null)[];

export type DragSource = "week" | "longGap" | "frequent" | "search";
export type DragPayload = { source: DragSource; index: number; recipeId: string };

export type TimelineWeek = { weekStart: string; hasEntries: boolean; label: string };
export type TimelineWeekEntry = { week: TimelineWeek | null; index: number | null };