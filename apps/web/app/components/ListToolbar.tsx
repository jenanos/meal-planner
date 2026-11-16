"use client";

import { Plus, Search, X } from "lucide-react";
import { Button, Input } from "@repo/ui";

type ListToolbarProps = {
  search: string;
  onSearchChange: (_value: string) => void;
  searchPlaceholder: string;
  addLabel: string;
  onAdd: () => void;
};

/**
 * Search and "add" for a list page. On a phone the search field gets the full
 * width and adding moves to a floating button within reach of the thumb.
 */
export function ListToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  addLabel,
  onAdd,
}: ListToolbarProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative min-w-0 flex-1 md:max-w-md">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          className="h-11 rounded-full bg-background/80 pl-10 pr-10 text-base md:text-base [&::-webkit-search-cancel-button]:hidden"
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          enterKeyHint="search"
          autoComplete="off"
        />
        {search ? (
          <button
            type="button"
            className="absolute right-1 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:bg-foreground/5"
            onClick={() => onSearchChange("")}
            aria-label="Tøm søk"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <Button type="button" className="ml-auto h-11 rounded-full px-5 max-md:hidden" onClick={onAdd}>
        <Plus aria-hidden="true" />
        {addLabel}
      </Button>

      <button
        type="button"
        className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-30 inline-flex h-14 items-center gap-2 rounded-full bg-primary px-5 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 outline-none transition-transform focus-visible:ring-4 focus-visible:ring-ring/40 active:scale-95 md:hidden"
        onClick={onAdd}
      >
        <Plus className="size-5" aria-hidden="true" />
        {addLabel}
      </button>
    </div>
  );
}
