"use client";

import React, { useCallback } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

interface SortableBoardColumnProps {
  id: string;
  title: string;
  count: number;
  children: React.ReactNode;
  isDraggingItem?: boolean;
}

export function SortableBoardColumn({
  id,
  title,
  count,
  children,
  isDraggingItem,
}: SortableBoardColumnProps) {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging: isColumnDragging,
  } = useSortable({ id: `col:${id}` });

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({ id });

  const mergedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setSortableRef(node);
      setDroppableRef(node);
    },
    [setSortableRef, setDroppableRef],
  );

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isColumnDragging ? 0.5 : 1,
  };

  const showHighlight = isOver && isDraggingItem;

  return (
    <div
      ref={mergedRef}
      style={style}
      className={`flex w-[280px] shrink-0 flex-col rounded-xl border bg-card/60 transition-colors ${
        showHighlight ? "border-primary/60 bg-primary/5" : "border-border/50"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          type="button"
          className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label={`Flytt kolonne ${title}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <h3 className="flex-1 truncate text-sm font-semibold text-card-foreground">
          {title}
        </h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {count}
        </span>
      </div>
      <div
        className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-2"
        style={{ maxHeight: "calc(100vh - 220px)" }}
      >
        {children}
      </div>
    </div>
  );
}
