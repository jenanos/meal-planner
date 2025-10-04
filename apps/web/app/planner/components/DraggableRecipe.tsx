"use client";

import type { CSSProperties, ReactNode } from "react";
import { useDraggable, type DraggableAttributes } from "@dnd-kit/core";

type SafeListeners = Record<string, any>;

type DraggableRecipeProps = {
  id: string;
  // eslint-disable-next-line no-unused-vars
  children: (args: {
    // eslint-disable-next-line no-unused-vars
    setNodeRef: (node: HTMLElement | null) => void;
    listeners: SafeListeners;        // spread-safe
    attributes: DraggableAttributes; // spread-safe
    style: CSSProperties;
    isDragging: boolean;
  }) => ReactNode;
};

export function DraggableRecipe({ id, children }: DraggableRecipeProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });

  // Allow natural scrolling when NOT dragging (mobile), and disable only while dragging
  const style: CSSProperties = isDragging
    ? { opacity: 0, touchAction: "none", cursor: "grabbing" }
    : { touchAction: "auto", cursor: "grab" };

  const safeListeners: SafeListeners = (listeners ?? {}) as SafeListeners;
  const safeAttributes: DraggableAttributes = (attributes ?? {}) as DraggableAttributes;

  return children({
    setNodeRef,
    listeners: safeListeners,
    attributes: safeAttributes,
    style,
    isDragging,
  });
}
