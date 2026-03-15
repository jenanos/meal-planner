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
import { recipeCategoryLabel } from "./labels";
import { ColumnFilter } from "./ColumnFilter";

const RECIPE_CATEGORIES = ["FISK", "KYLLING", "VEGETAR", "STORFE", "ANNET"] as const;
type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];

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
  const [isDraggingItem, setIsDraggingItem] = useState(false);
  const [columnOrder, setColumnOrder] = useState<RecipeCategory[]>([
    ...RECIPE_CATEGORIES,
  ]);
  const [visibleColumns, setVisibleColumns] = useState<Set<RecipeCategory>>(
    () => new Set(RECIPE_CATEGORIES),
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
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

      // Column reorder
      if (activeStr.startsWith("col:")) {
        if (overStr.startsWith("col:")) {
          const fromCol = activeStr.slice(4);
          const toCol = overStr.slice(4);
          if (fromCol !== toCol) {
            setColumnOrder((prev) => {
              const oldIndex = prev.indexOf(fromCol as RecipeCategory);
              const newIndex = prev.indexOf(toCol as RecipeCategory);
              return arrayMove(prev, oldIndex, newIndex);
            });
          }
        }
        return;
      }

      // Item drag
      const targetColumn = overStr.startsWith("col:")
        ? overStr.slice(4)
        : overStr;
      const recipeId = activeStr;
      const recipe = recipes.find((r) => r.id === recipeId);
      if (!recipe || recipe.category === targetColumn) return;
      patchField.mutate({
        id: recipeId,
        category: targetColumn as RecipeCategory,
      });
    },
    [recipes, patchField],
  );

  const toggleColumn = useCallback((col: RecipeCategory) => {
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
    return <p className="p-4 text-muted-foreground">Laster oppskrifter…</p>;

  const visibleOrder = columnOrder.filter((col) => visibleColumns.has(col));
  const sortableIds = visibleOrder.map((col) => `col:${col}`);

  return (
    <div className="flex flex-col gap-3">
      <ColumnFilter
        columns={RECIPE_CATEGORIES}
        visible={visibleColumns}
        onToggle={toggleColumn}
        getLabel={recipeCategoryLabel}
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
                  title={recipeCategoryLabel(cat)}
                  count={items.length}
                  isDraggingItem={isDraggingItem}
                >
                  {items.map((r) => (
                    <BoardCard key={r.id} id={r.id}>
                      <span className="font-medium">{r.name}</span>
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
