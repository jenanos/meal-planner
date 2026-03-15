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
import { healthLabel, CategoryEmoji } from "./labels";
import { ColumnFilter } from "./ColumnFilter";

type Recipe = {
  id: string;
  name: string;
  category: string;
  healthScore: number;
  everydayScore: number;
};

const SCORES = [1, 2, 3, 4, 5] as const;
type Score = (typeof SCORES)[number];
const SCORE_STRINGS = SCORES.map(String) as unknown as readonly string[];

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
  const [isDraggingItem, setIsDraggingItem] = useState(false);
  const [columnOrder, setColumnOrder] = useState<Score[]>([...SCORES]);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => new Set(SCORE_STRINGS),
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
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
          const fromScore = Number(activeStr.slice(4));
          const toScore = Number(overStr.slice(4));
          if (fromScore !== toScore) {
            setColumnOrder((prev) => {
              const oldIndex = prev.indexOf(fromScore as Score);
              const newIndex = prev.indexOf(toScore as Score);
              return arrayMove(prev, oldIndex, newIndex);
            });
          }
        }
        return;
      }

      const targetStr = overStr.startsWith("col:")
        ? overStr.slice(4)
        : overStr;
      const targetScore = Number(targetStr);
      const recipeId = activeStr;
      const recipe = recipes.find((r) => r.id === recipeId);
      if (!recipe || recipe.healthScore === targetScore) return;
      patchField.mutate({ id: recipeId, healthScore: targetScore });
    },
    [recipes, patchField],
  );

  const toggleColumn = useCallback((col: string) => {
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

  const visibleOrder = columnOrder.filter((s) =>
    visibleColumns.has(String(s)),
  );
  const sortableIds = visibleOrder.map((s) => `col:${s}`);

  return (
    <div className="flex flex-col gap-3">
      <ColumnFilter
        columns={SCORE_STRINGS}
        visible={visibleColumns}
        onToggle={toggleColumn}
        getLabel={(s) => healthLabel(Number(s))}
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
            {visibleOrder.map((score) => {
              const items = columns.get(score) ?? [];
              return (
                <SortableBoardColumn
                  key={score}
                  id={String(score)}
                  title={healthLabel(score)}
                  count={items.length}
                  isDraggingItem={isDraggingItem}
                >
                  {items.map((r) => (
                    <BoardCard key={r.id} id={r.id}>
                      <div className="flex items-center gap-1.5">
                        <CategoryEmoji category={r.category} size={12} />
                        <span className="font-medium">{r.name}</span>
                      </div>
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
