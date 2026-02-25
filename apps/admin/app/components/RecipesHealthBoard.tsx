"use client";

import React, { useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { trpc } from "../../lib/trpcClient";
import { BoardColumn } from "./BoardColumn";
import { BoardCard } from "./BoardCard";
import { DragOverlayCard } from "./DragOverlayCard";
import { healthLabel, CategoryEmoji } from "./labels";

type Recipe = {
  id: string;
  name: string;
  category: string;
  healthScore: number;
  everydayScore: number;
};

const SCORES = [1, 2, 3, 4, 5];

export function RecipesHealthBoard() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.recipe.list.useQuery({
    page: 1,
    pageSize: 1000,
  });
  const patchField = trpc.recipe.patchField.useMutation({
    onSuccess: () => utils.recipe.list.invalidate(),
  });

  const recipes: Recipe[] = data?.items ?? [];
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const columns = useMemo(() => {
    const map = new Map<number, Recipe[]>();
    for (const s of SCORES) map.set(s, []);
    for (const r of recipes) {
      const key = r.healthScore ?? 3;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [recipes]);

  const activeItem = activeId ? recipes.find((r) => r.id === activeId) : null;

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const recipeId = active.id as string;
    const targetScore = Number(over.id);
    const recipe = recipes.find((r) => r.id === recipeId);
    if (!recipe || recipe.healthScore === targetScore) return;
    patchField.mutate({ id: recipeId, healthScore: targetScore });
  }

  if (isLoading)
    return <p className="p-4 text-muted-foreground">Laster oppskrifter…</p>;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={({ active }) => setActiveId(active.id as string)}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {SCORES.map((score) => {
          const items = columns.get(score) ?? [];
          return (
            <BoardColumn
              key={score}
              id={String(score)}
              title={healthLabel(score)}
              count={items.length}
            >
              {items.map((r) => (
                <BoardCard key={r.id} id={r.id}>
                  <div className="flex items-center gap-1.5">
                    <CategoryEmoji category={r.category} size={12} />
                    <span className="font-medium">{r.name}</span>
                  </div>
                </BoardCard>
              ))}
            </BoardColumn>
          );
        })}
      </div>
      <DragOverlayCard>
        {activeItem ? <span>{activeItem.name}</span> : null}
      </DragOverlayCard>
    </DndContext>
  );
}
