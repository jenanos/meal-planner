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
  "FRUKT_OG_GRONT",
  "KJOTT",
  "OST",
  "MEIERI_OG_EGG",
  "BROD",
  "BAKEVARER",
  "HERMETIKK",
  "TORRVARER",
  "HUSHOLDNING",
  "ANNET",
] as const;

const CATEGORY_COLUMNS = ["UKATEGORISERT", ...INGREDIENT_CATEGORIES] as const;

type CategoryColumn = (typeof CATEGORY_COLUMNS)[number];
type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];

type ExtraItem = {
  id: string;
  name: string;
  usageCount: number;
  category: string | null;
};

function toColumn(category: string | null | undefined): CategoryColumn {
  if (!category) return "UKATEGORISERT";
  const upper = category.toUpperCase();
  if (INGREDIENT_CATEGORIES.includes(upper as IngredientCategory)) {
    return upper as IngredientCategory;
  }
  return "UKATEGORISERT";
}

function columnLabel(column: CategoryColumn) {
  if (column === "UKATEGORISERT") return "Uten kategori";
  return ingredientCategoryLabel(column);
}

export function ExtraItemsCategoryBoard() {
  const utils = trpc.useUtils();
  const { data: extraItemsData = [], isLoading } =
    trpc.planner.extraCatalogList.useQuery();
  const extraItems = extraItemsData as ExtraItem[];
  const bulkUpdate = trpc.planner.extraCatalogBulkUpdateCategories.useMutation({
    onSuccess: () => {
      utils.planner.extraCatalogList.invalidate();
      utils.planner.extraSuggest.invalidate();
    },
  });

  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
  );

  const columns = useMemo(() => {
    const map = new Map<CategoryColumn, ExtraItem[]>();
    for (const column of CATEGORY_COLUMNS) {
      map.set(column, []);
    }

    for (const item of extraItems) {
      const column = toColumn(item.category);
      map.get(column)!.push(item);
    }

    return map;
  }, [extraItems]);

  const activeItem = activeId
    ? extraItems.find((item) => item.id === activeId)
    : null;

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const extraItemId = active.id as string;
    const targetColumn = over.id as CategoryColumn;
    const item = extraItems.find((candidate) => candidate.id === extraItemId);
    if (!item) return;
    if (toColumn(item.category) === targetColumn) return;

    const nextCategory =
      targetColumn === "UKATEGORISERT" ? null : targetColumn;

    bulkUpdate.mutate({
      updates: [{ id: extraItemId, category: nextCategory }],
    });
  }

  if (isLoading) {
    return <p className="p-4 text-muted-foreground">Laster egne elementer…</p>;
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={({ active }) => setActiveId(active.id as string)}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {CATEGORY_COLUMNS.map((column) => {
          const items = columns.get(column) ?? [];
          return (
            <BoardColumn
              key={column}
              id={column}
              title={columnLabel(column)}
              count={items.length}
            >
              {items.map((item) => (
                <BoardCard key={item.id} id={item.id}>
                  <span className="font-medium">{item.name}</span>
                  {item.usageCount > 0 ? (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({item.usageCount})
                    </span>
                  ) : null}
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
