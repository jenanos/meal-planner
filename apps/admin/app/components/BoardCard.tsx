"use client";

import React from "react";
import { useDraggable } from "@dnd-kit/core";

interface BoardCardProps {
  id: string;
  children: React.ReactNode;
}

export function BoardCard({ id, children }: BoardCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id });

  const style: React.CSSProperties = transform
    ? {
        transform: `translate(${transform.x}px, ${transform.y}px)`,
      }
    : {};

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      className={`cursor-grab rounded-lg border border-border/40 bg-background px-3 py-2 text-sm shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      {children}
    </div>
  );
}
