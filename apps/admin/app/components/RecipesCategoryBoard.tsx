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
import { recipeCategoryLabel } from "./labels";

const RECIPE_CATEGORIES = ["FISK", "KYLLING", "VEGETAR", "STORFE", "ANNET"] as const;

type Recipe = {
  id: string;
  name: string;
  category: string;
  healthScore: number;
  everydayScore: number;
};

export function RecipesCategoryBoard() {
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
    const map = new Map<string, Recipe[]>();
    for (const cat of RECIPE_CATEGORIES) map.set(cat, []);
    for (const r of recipes) {
      const key = r.category || "ANNET";
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
    const targetCategory = over.id as string;
    const recipe = recipes.find((r) => r.id === recipeId);
    if (!recipe || recipe.category === targetCategory) return;
    patchField.mutate({
      id: recipeId,
      category: targetCategory as typeof RECIPE_CATEGORIES[number],
    });
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
        {RECIPE_CATEGORIES.map((cat) => {
          const items = columns.get(cat) ?? [];
          return (
            <BoardColumn
              key={cat}
              id={cat}
              title={recipeCategoryLabel(cat)}
              count={items.length}
            >
              {items.map((r) => (
                <BoardCard key={r.id} id={r.id}>
                  <span className="font-medium">{r.name}</span>
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
