"use client";

import type { CSSProperties } from "react";
import type { PlannerDragItem, DayName } from "../types";
import { MagicCard } from "@repo/ui";
import { dayBaseHsl, dayHoverGradients, getDayByIndex } from "../palette";
import { CategoryEmoji } from "../../components/CategoryEmoji";

type Props = {
  item: PlannerDragItem | null;
  overIndex: number | null;
  dayNames: readonly string[];
};

export function DragOverlayCard({ item, overIndex, dayNames }: Props) {
  if (!item) return null;

  const { recipe, source } = item;
  const isAdd = source !== "week";
  const targetLabel = overIndex != null ? dayNames[overIndex] : "Slipp på en dag";

  let styleVar: CSSProperties | undefined;
  let gradientFrom = "#EA580C";
  let gradientTo = "#16A34A";
  let gradientColor = "#B45309";

  if (overIndex != null && Number.isFinite(overIndex)) {
    const dayName = (dayNames[overIndex] as DayName) ?? getDayByIndex(overIndex);
    styleVar = { ["--magic-card-bg" as any]: dayBaseHsl[dayName] } as CSSProperties;
    const gradient = dayHoverGradients[dayName];
    gradientFrom = gradient.from;
    gradientTo = gradient.to;
    gradientColor = gradient.color;
  } else {
    if (source === "frequent") {
      gradientFrom = "#EA580C";
      gradientTo = "#16A34A";
      gradientColor = "#EA580C";
    } else if (source === "longGap") {
      gradientFrom = "#92400E";
      gradientTo = "#DC2626";
      gradientColor = "#B91C1C";
    } else {
      gradientFrom = "#F59E0B";
      gradientTo = "#84CC16";
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
