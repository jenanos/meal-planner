"use client";

import React from "react";
import { useDroppable } from "@dnd-kit/core";

interface BoardColumnProps {
  id: string;
  title: string;
  count: number;
  children: React.ReactNode;
}

export function BoardColumn({ id, title, count, children }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-0 flex-col rounded-xl border bg-card/60 transition-colors ${
        isOver ? "border-primary/60 bg-primary/5" : "border-border/50"
      }`}
    >
      <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
        <h3 className="text-sm font-semibold text-card-foreground">{title}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {count}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-2" style={{ maxHeight: "calc(100vh - 180px)" }}>
        {children}
      </div>
    </div>
  );
}
