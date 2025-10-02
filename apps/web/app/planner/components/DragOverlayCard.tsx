"use client";

import type { DragPayload, RecipeDTO, WeekState, DayName } from "../types";
import { MagicCard } from "@repo/ui";
import { dayBaseHsl, dayHoverGradients, getDayByIndex } from "../palette";
import { CategoryEmoji } from "../../components/CategoryEmoji";

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

  // Dynamiske farger: når vi har en overIndex, bruk ukedagens palett; ellers bruk kildebasert fallback
  let styleVar: React.CSSProperties | undefined;
  let gradientFrom = "#EA580C";
  let gradientTo = "#16A34A";
  let gradientColor = "#B45309";

  if (overIndex != null && Number.isFinite(overIndex)) {
    const dayName = (dayNames[overIndex] as DayName) ?? getDayByIndex(overIndex);
    styleVar = { ["--magic-card-bg" as any]: dayBaseHsl[dayName] } as React.CSSProperties;
    const g = dayHoverGradients[dayName];
    gradientFrom = g.from;
    gradientTo = g.to;
    gradientColor = g.color;
  } else {
    // Fallback etter kilde
    if (payload.source === "frequent") {
      gradientFrom = "#EA580C"; // orange
      gradientTo = "#16A34A";   // green
      gradientColor = "#EA580C";
    } else if (payload.source === "longGap") {
      gradientFrom = "#92400E"; // brown
      gradientTo = "#DC2626";   // red
      gradientColor = "#B91C1C";
    } else {
      gradientFrom = "#F59E0B"; // amber
      gradientTo = "#84CC16";   // lime
      gradientColor = "#B45309";
    }
  }

  return (
    <MagicCard
      className="pointer-events-none select-none rounded-xl min-w-[200px] max-w-[260px]"
      style={styleVar}
      gradientFrom={gradientFrom}
      gradientTo={gradientTo}
      gradientColor={gradientColor}
      gradientSize={300}
      gradientOpacity={0.6}
    >
      <div className="px-4 py-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
          {isAdd ? "Legg til" : "Flytter"}
        </div>
        <div className="font-medium leading-snug line-clamp-2">{recipe.name}</div>
        {recipe.category ? <CategoryEmoji category={recipe.category as any} /> : null}
        <div className="mt-2 inline-block rounded-full bg-primary/10 text-primary px-2 py-1 text-[11px]">{targetLabel}</div>
      </div>
    </MagicCard>
  );
}
