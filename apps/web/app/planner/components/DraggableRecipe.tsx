"use client";

import type { CSSProperties, ReactNode } from "react";
import { useDraggable, type DraggableAttributes } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { PlannerDragItem } from "../types";

type SafeListeners = Record<string, any>;

type DraggableRenderArgs = {
  // eslint-disable-next-line no-unused-vars
  setNodeRef: (node: HTMLElement | null) => void;
  listeners: SafeListeners;        // spread-safe
  attributes: DraggableAttributes; // spread-safe
  style: CSSProperties;
  isDragging: boolean;
};

type DraggableRecipeProps = {
  id: string;
  data: PlannerDragItem;
  // eslint-disable-next-line no-unused-vars
  children: (args: DraggableRenderArgs) => ReactNode;
};

export function DraggableRecipe({ id, data, children }: DraggableRecipeProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useDraggable({ id, data });

  const style: CSSProperties = {
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    transition,
    cursor: isDragging ? "grabbing" : "grab",
    touchAction: "none",
    WebkitTapHighlightColor: "transparent",
    opacity: isDragging ? 0.3 : undefined,
  };

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
