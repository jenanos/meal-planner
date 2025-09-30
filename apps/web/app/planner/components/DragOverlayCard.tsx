"use client";

import type { DragPayload, RecipeDTO, WeekState } from "../types";
import { MagicCard } from "@repo/ui";

type Props = {
  payload: DragPayload | null;
  overIndex: number | null;
  dayNames: readonly string[];
  week: WeekState;
  longGap: RecipeDTO[];
  frequent: RecipeDTO[];
  searchResults: RecipeDTO[];
};

export function DragOverlayCard({ payload, overIndex, dayNames, week, longGap, frequent, searchResults }: Props) {
  if (!payload) return null;

  const getRecipe = (): RecipeDTO | null => {
    if (payload.source === "week") return week[payload.index] ?? null;
    const lists: Record<Exclude<DragPayload["source"], "week">, RecipeDTO[]> = {
      longGap,
      frequent,
      search: searchResults,
    };
    const list = lists[payload.source as Exclude<DragPayload["source"], "week">];
    return list[payload.index] ?? list.find((item) => item.id === payload.recipeId) ?? null;
  };

  const recipe = getRecipe();
  if (!recipe) return null;

  const isAdd = payload.source !== "week";
  const targetLabel = overIndex != null ? dayNames[overIndex] : "Slipp på en dag";

  return (
    <MagicCard
      className="pointer-events-none select-none rounded-xl min-w-[200px] max-w-[260px]"
      style={{ ["--magic-card-bg" as any]: "30 70% 90%" }}
      gradientFrom="#EA580C"
      gradientTo="#16A34A"
      gradientColor="#B45309"
      gradientSize={280}
      gradientOpacity={0.55}
    >
      <div className="px-4 py-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
          {isAdd ? "Legg til" : "Flytter"}
        </div>
        <div className="font-medium leading-snug line-clamp-2">{recipe.name}</div>
        {recipe.category ? <div className="text-xs text-muted-foreground">{recipe.category}</div> : null}
        <div className="mt-2 inline-block rounded-full bg-primary/10 text-primary px-2 py-1 text-[11px]">{targetLabel}</div>
      </div>
    </MagicCard>
  );
}
