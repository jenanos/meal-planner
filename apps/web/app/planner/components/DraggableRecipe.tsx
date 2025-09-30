"use client";

import type { CSSProperties, ReactNode } from "react";
import { useDraggable, type DraggableAttributes } from "@dnd-kit/core";

type SafeListeners = Record<string, any>;

type DraggableRecipeProps = {
  id: string;
  children: (args: {
    setNodeRef: (node: HTMLElement | null) => void;
    listeners: SafeListeners;        // spread-safe
    attributes: DraggableAttributes; // spread-safe
    style: CSSProperties;
  }) => ReactNode;
};

export function DraggableRecipe({ id, children }: DraggableRecipeProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });

  const style: CSSProperties = isDragging
    ? { opacity: 0, touchAction: "none", cursor: "grabbing" }
    : { touchAction: "none", cursor: "grab" };

  const safeListeners: SafeListeners = (listeners ?? {}) as SafeListeners;
  const safeAttributes: DraggableAttributes = (attributes ?? {}) as DraggableAttributes;

  return children({
    setNodeRef,
    listeners: safeListeners,
    attributes: safeAttributes,
    style,
  });
}
