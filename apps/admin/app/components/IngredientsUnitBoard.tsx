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

type Ingredient = {
  id: string;
  name: string;
  unit?: string;
  usageCount: number;
  isPantryItem: boolean;
  category: string;
};

export function IngredientsUnitBoard() {
  const utils = trpc.useUtils();
  const { data: ingredients = [], isLoading } = trpc.ingredient.list.useQuery();
  const bulkUpdate = trpc.ingredient.bulkUpdateUnits.useMutation({
    onSuccess: () => utils.ingredient.list.invalidate(),
  });

  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const columns = useMemo(() => {
    const map = new Map<string, Ingredient[]>();
    map.set("__none__", []);
    for (const ing of ingredients) {
      const key = ing.unit ?? "__none__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ing);
    }
    return map;
  }, [ingredients]);

  const unitKeys = useMemo(() => {
    const keys = Array.from(columns.keys());
    keys.sort((a, b) => {
      if (a === "__none__") return -1;
      if (b === "__none__") return 1;
      return a.localeCompare(b, "nb");
    });
    return keys;
  }, [columns]);

  const activeItem = activeId
    ? ingredients.find((i) => i.id === activeId)
    : null;

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const ingredientId = active.id as string;
    const targetUnit = over.id as string;
    const ingredient = ingredients.find((i) => i.id === ingredientId);
    if (!ingredient) return;
    const currentUnit = ingredient.unit ?? "__none__";
    if (currentUnit === targetUnit) return;
    if (targetUnit === "__none__") return; // Can't remove unit via drag
    bulkUpdate.mutate({ updates: [{ id: ingredientId, unit: targetUnit }] });
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
        {unitKeys.map((unitKey) => {
          const items = columns.get(unitKey) ?? [];
          return (
            <BoardColumn
              key={unitKey}
              id={unitKey}
              title={unitKey === "__none__" ? "Uten enhet" : unitKey}
              count={items.length}
            >
              {items.map((ing) => (
                <BoardCard key={ing.id} id={ing.id}>
                  <span className="font-medium">{ing.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({ing.usageCount})
                  </span>
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
