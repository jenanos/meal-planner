"use client";

import React, { useCallback, useMemo, useState } from "react";
import { trpc } from "../../lib/trpcClient";
import { ingredientCategoryLabel } from "./labels";

type Ingredient = {
  id: string;
  name: string;
  unit?: string;
  usageCount: number;
  isPantryItem: boolean;
  category: string;
};

const ALL_CATEGORIES = [
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

export function IngredientsPantryToggle() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.ingredient.list.useQuery();
  const ingredients = useMemo<Ingredient[]>(
    () => (data as Ingredient[]) ?? [],
    [data],
  );

  const bulkUpdate = trpc.ingredient.bulkUpdatePantryItems.useMutation({
    onSuccess: () => utils.ingredient.list.invalidate(),
  });

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = ingredients;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q));
    }
    if (categoryFilter) {
      list = list.filter((i) => i.category === categoryFilter);
    }
    return list;
  }, [ingredients, search, categoryFilter]);

  const pantryCount = useMemo(
    () => ingredients.filter((i) => i.isPantryItem).length,
    [ingredients],
  );

  const filteredPantryCount = useMemo(
    () => filtered.filter((i) => i.isPantryItem).length,
    [filtered],
  );

  const handleToggle = useCallback(
    (id: string, currentValue: boolean) => {
      bulkUpdate.mutate({
        updates: [{ id, isPantryItem: !currentValue }],
      });
    },
    [bulkUpdate],
  );

  if (isLoading) {
    return <p className="p-4 text-muted-foreground">Laster ingredienser…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
          {pantryCount} av {ingredients.length} er basisvarer
        </span>
      </div>

      {/* Search and filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Søk etter ingrediens…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setCategoryFilter(null)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              categoryFilter === null
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-card-foreground hover:bg-accent"
            }`}
          >
            Alle
          </button>
          {ALL_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() =>
                setCategoryFilter(categoryFilter === cat ? null : cat)
              }
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                categoryFilter === cat
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-card-foreground hover:bg-accent"
              }`}
            >
              {ingredientCategoryLabel(cat)}
            </button>
          ))}
        </div>
      </div>

      {/* Filtered count */}
      <p className="text-xs text-muted-foreground">
        Viser {filtered.length} ingredienser
        {categoryFilter || search.trim() ? ` (${filteredPantryCount} basisvarer)` : ""}
      </p>

      {/* Ingredient list */}
      <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-border">
        {filtered.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            Ingen ingredienser funnet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((ing) => (
              <li
                key={ing.id}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 transition-colors"
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={ing.isPantryItem}
                  onClick={() => handleToggle(ing.id, ing.isPantryItem)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                    ing.isPantryItem ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                      ing.isPantryItem ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
                <span className="flex-1 text-sm font-medium">{ing.name}</span>
                <span className="text-xs text-muted-foreground">
                  {ingredientCategoryLabel(ing.category)}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({ing.usageCount})
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
