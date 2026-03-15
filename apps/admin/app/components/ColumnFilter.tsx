"use client";

import React from "react";

interface ColumnFilterProps<T extends string> {
  columns: readonly T[];
  visible: Set<T>;
  onToggle: (_column: T) => void;
  getLabel: (_column: T) => string;
}

export function ColumnFilter<T extends string>({
  columns,
  visible,
  onToggle,
  getLabel,
}: ColumnFilterProps<T>) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="mr-1 self-center text-xs text-muted-foreground">
        Vis:
      </span>
      {columns.map((col) => (
        <button
          key={col}
          type="button"
          onClick={() => onToggle(col)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            visible.has(col)
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:bg-accent"
          }`}
        >
          {getLabel(col)}
        </button>
      ))}
    </div>
  );
}
