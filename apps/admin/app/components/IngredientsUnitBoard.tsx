"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { ColumnFilter } from "./ColumnFilter";

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
  const { data, isLoading } = trpc.ingredient.list.useQuery();
  const ingredients = useMemo<Ingredient[]>(() => (data as Ingredient[]) ?? [], [data]);
  const bulkUpdate = trpc.ingredient.bulkUpdateUnits.useMutation({
    onSuccess: () => utils.ingredient.list.invalidate(),
  });

  const [activeId, setActiveId] = useState<string | null>(null);
  const [isDraggingItem, setIsDraggingItem] = useState(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
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

  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => new Set<string>(),
  );

  // Reconcile column order when data-derived keys change
  useEffect(() => {
    const unitKeySet = new Set(unitKeys);

    setColumnOrder((prev) => {
      const newKeys = unitKeys.filter((k) => !prev.includes(k));
      const validPrev = prev.filter((k) => unitKeySet.has(k));
      const next = [...validPrev, ...newKeys];
      if (
        next.length === prev.length &&
        next.every((k, i) => k === prev[i])
      )
        return prev;
      return next;
    });
    setVisibleColumns((prev) => {
      if (prev.size === 0) return new Set(unitKeys);
      let changed = false;
      const next = new Set(prev);
      for (const k of unitKeys) {
        if (!next.has(k)) {
          next.add(k);
          changed = true;
        }
      }
      // Remove keys that no longer exist
      Array.from(next).forEach((k) => {
        if (!unitKeySet.has(k)) {
          next.delete(k);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [unitKeys]);

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
              const oldIndex = prev.indexOf(fromCol);
              const newIndex = prev.indexOf(toCol);
              return arrayMove(prev, oldIndex, newIndex);
            });
          }
        }
        return;
      }

      const targetUnit = overStr.startsWith("col:")
        ? overStr.slice(4)
        : overStr;
      const ingredientId = activeStr;
      const ingredient = ingredients.find((i) => i.id === ingredientId);
      if (!ingredient) return;
      const currentUnit = ingredient.unit ?? "__none__";
      if (currentUnit === targetUnit) return;
      if (targetUnit === "__none__") return; // Can't remove unit via drag
      bulkUpdate.mutate({ updates: [{ id: ingredientId, unit: targetUnit }] });
    },
    [ingredients, bulkUpdate],
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
    return <p className="p-4 text-muted-foreground">Laster ingredienser…</p>;

  const visibleOrder = columnOrder.filter((col) => visibleColumns.has(col));
  const sortableIds = visibleOrder.map((col) => `col:${col}`);

  return (
    <div className="flex flex-col gap-3">
      <ColumnFilter
        columns={unitKeys}
        visible={visibleColumns}
        onToggle={toggleColumn}
        getLabel={(k) => (k === "__none__" ? "Uten enhet" : k)}
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
            {visibleOrder.map((unitKey) => {
              const items = columns.get(unitKey) ?? [];
              return (
                <SortableBoardColumn
                  key={unitKey}
                  id={unitKey}
                  title={unitKey === "__none__" ? "Uten enhet" : unitKey}
                  count={items.length}
                  isDraggingItem={isDraggingItem}
                >
                  {items.map((ing) => (
                    <BoardCard key={ing.id} id={ing.id}>
                      <span className="font-medium">{ing.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({ing.usageCount})
                      </span>
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
