"use client";

import React from "react";
import { DragOverlay as DndDragOverlay } from "@dnd-kit/core";

export function DragOverlayCard({ children }: { children: React.ReactNode }) {
  return (
    <DndDragOverlay>
      {children ? (
        <div className="rounded-lg border border-primary/50 bg-background px-3 py-2 text-sm shadow-lg">
          {children}
        </div>
      ) : null}
    </DndDragOverlay>
  );
}
