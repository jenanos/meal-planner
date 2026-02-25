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
import { ingredientCategoryLabel } from "./labels";

const INGREDIENT_CATEGORIES = [
  "FRUKT",
  "GRONNSAKER",
  "KJOTT",
  "OST",
  "MEIERI_OG_EGG",
  "BROD",
  "BAKEVARER",
  "HERMETIKK",
  "TORRVARER",
  "UKATEGORISERT",
] as const;

type Ingredient = {
  id: string;
  name: string;
  unit?: string;
  usageCount: number;
  isPantryItem: boolean;
  category: string;
};

export function IngredientsCategoryBoard() {
  const utils = trpc.useUtils();
  const { data: ingredients = [], isLoading } = trpc.ingredient.list.useQuery();
  const bulkUpdate = trpc.ingredient.bulkUpdateCategories.useMutation({
    onSuccess: () => utils.ingredient.list.invalidate(),
  });

  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const columns = useMemo(() => {
    const map = new Map<string, Ingredient[]>();
    for (const cat of INGREDIENT_CATEGORIES) map.set(cat, []);
    for (const ing of ingredients) {
      const key = ing.category || "UKATEGORISERT";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ing);
    }
    return map;
  }, [ingredients]);

  const activeItem = activeId
    ? ingredients.find((i) => i.id === activeId)
    : null;

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const ingredientId = active.id as string;
    const targetCategory = over.id as string;
    const ingredient = ingredients.find((i) => i.id === ingredientId);
    if (!ingredient) return;
    if (ingredient.category === targetCategory) return;
    bulkUpdate.mutate({
      updates: [{ id: ingredientId, category: targetCategory as typeof INGREDIENT_CATEGORIES[number] }],
    });
  }

  if (isLoading)
    return <p className="p-4 text-muted-foreground">Laster ingredienser…</p>;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={({ active }) => setActiveId(active.id as string)}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {INGREDIENT_CATEGORIES.map((cat) => {
          const items = columns.get(cat) ?? [];
          return (
            <BoardColumn
              key={cat}
              id={cat}
              title={ingredientCategoryLabel(cat)}
              count={items.length}
            >
              {items.map((ing) => (
                <BoardCard key={ing.id} id={ing.id}>
                  <span className="font-medium">{ing.name}</span>
                  {ing.unit && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({ing.unit})
                    </span>
                  )}
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
