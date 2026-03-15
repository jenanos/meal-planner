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
  const [isDraggingItem, setIsDraggingItem] = useState(false);
  const [columnOrder, setColumnOrder] = useState<CategoryColumn[]>([
    ...CATEGORY_COLUMNS,
  ]);
  const [visibleColumns, setVisibleColumns] = useState<Set<CategoryColumn>>(
    () => new Set(CATEGORY_COLUMNS),
  );

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
              const oldIndex = prev.indexOf(fromCol as CategoryColumn);
              const newIndex = prev.indexOf(toCol as CategoryColumn);
              return arrayMove(prev, oldIndex, newIndex);
            });
          }
        }
        return;
      }

      const targetColumn = (
        overStr.startsWith("col:") ? overStr.slice(4) : overStr
      ) as CategoryColumn;
      const extraItemId = activeStr;
      const item = extraItems.find((candidate) => candidate.id === extraItemId);
      if (!item) return;
      if (toColumn(item.category) === targetColumn) return;

      const nextCategory =
        targetColumn === "UKATEGORISERT" ? null : targetColumn;

      bulkUpdate.mutate({
        updates: [{ id: extraItemId, category: nextCategory }],
      });
    },
    [extraItems, bulkUpdate],
  );

  const toggleColumn = useCallback((col: CategoryColumn) => {
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

  if (isLoading) {
    return <p className="p-4 text-muted-foreground">Laster egne elementer…</p>;
  }

  const visibleOrder = columnOrder.filter((col) => visibleColumns.has(col));
  const sortableIds = visibleOrder.map((col) => `col:${col}`);

  return (
    <div className="flex flex-col gap-3">
      <ColumnFilter
        columns={CATEGORY_COLUMNS}
        visible={visibleColumns}
        onToggle={toggleColumn}
        getLabel={columnLabel}
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
            {visibleOrder.map((column) => {
              const items = columns.get(column) ?? [];
              return (
                <SortableBoardColumn
                  key={column}
                  id={column}
                  title={columnLabel(column)}
                  count={items.length}
                  isDraggingItem={isDraggingItem}
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
