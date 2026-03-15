"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { trpc } from "../../lib/trpcClient";
import { SortableBoardColumn } from "./SortableBoardColumn";
import { BoardCard } from "./BoardCard";
import { DragOverlayCard } from "./DragOverlayCard";
import { ingredientCategoryLabel } from "./labels";
import { ColumnFilter } from "./ColumnFilter";

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

type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];

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
  const [isDraggingItem, setIsDraggingItem] = useState(false);
  const [columnOrder, setColumnOrder] = useState<IngredientCategory[]>([
    ...INGREDIENT_CATEGORIES,
  ]);
  const [visibleColumns, setVisibleColumns] = useState<
    Set<IngredientCategory>
  >(() => new Set(INGREDIENT_CATEGORIES));

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
  );

  const columns = useMemo(() => {
    const map = new Map<string, Ingredient[]>();
    for (const cat of INGREDIENT_CATEGORIES) map.set(cat, []);
    for (const ing of ingredients) {
      const key = ing.category || "ANNET";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ing);
    }
    return map;
  }, [ingredients]);

  const activeItem = activeId
    ? ingredients.find((i) => i.id === activeId)
    : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = String(event.active.id);
    if (id.startsWith("col:")) {
      setIsDraggingItem(false);
      setActiveId(null);
    } else {
      setIsDraggingItem(true);
      setActiveId(id);
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      setIsDraggingItem(false);
      const { active, over } = event;
      if (!over) return;

      const activeStr = String(active.id);
      const overStr = String(over.id);

      if (activeStr.startsWith("col:")) {
        if (overStr.startsWith("col:")) {
          const fromCol = activeStr.slice(4);
          const toCol = overStr.slice(4);
          if (fromCol !== toCol) {
            setColumnOrder((prev) => {
              const oldIndex = prev.indexOf(fromCol as IngredientCategory);
              const newIndex = prev.indexOf(toCol as IngredientCategory);
              return arrayMove(prev, oldIndex, newIndex);
            });
          }
        }
        return;
      }

      const targetCategory = overStr.startsWith("col:")
        ? overStr.slice(4)
        : overStr;
      const ingredientId = activeStr;
      const ingredient = ingredients.find((i) => i.id === ingredientId);
      if (!ingredient) return;
      if (ingredient.category === targetCategory) return;
      bulkUpdate.mutate({
        updates: [
          {
            id: ingredientId,
            category:
              targetCategory as (typeof INGREDIENT_CATEGORIES)[number],
          },
        ],
      });
    },
    [ingredients, bulkUpdate],
  );

  const toggleColumn = useCallback((col: IngredientCategory) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) {
        if (next.size > 1) next.delete(col);
      } else {
        next.add(col);
      }
      return next;
    });
  }, []);

  if (isLoading)
    return <p className="p-4 text-muted-foreground">Laster ingredienser…</p>;

  const visibleOrder = columnOrder.filter((col) => visibleColumns.has(col));
  const sortableIds = visibleOrder.map((col) => `col:${col}`);

  return (
    <div className="flex flex-col gap-3">
      <ColumnFilter
        columns={INGREDIENT_CATEGORIES}
        visible={visibleColumns}
        onToggle={toggleColumn}
        getLabel={ingredientCategoryLabel}
      />
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortableIds}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex gap-3 overflow-x-auto pb-4">
            {visibleOrder.map((cat) => {
              const items = columns.get(cat) ?? [];
              return (
                <SortableBoardColumn
                  key={cat}
                  id={cat}
                  title={ingredientCategoryLabel(cat)}
                  count={items.length}
                  isDraggingItem={isDraggingItem}
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
                </SortableBoardColumn>
              );
            })}
          </div>
        </SortableContext>
        <DragOverlayCard>
          {activeItem ? <span>{activeItem.name}</span> : null}
        </DragOverlayCard>
      </DndContext>
    </div>
  );
}
