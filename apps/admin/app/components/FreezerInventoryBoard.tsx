"use client";

import React, { useCallback, useMemo, useState } from "react";
import { trpc } from "../../lib/trpcClient";

type FreezerItem = {
  id: string;
  recipeId: string;
  recipeName: string;
  recipeCategory: string;
  quantity: number;
};

export function FreezerInventoryBoard() {
  const utils = trpc.useUtils();
  const freezerQuery = trpc.freezer.list.useQuery();
  const recipesQuery = trpc.recipe.list.useQuery({ pageSize: 1000 });
  const upsertMutation = trpc.freezer.upsert.useMutation({
    onSuccess: () => utils.freezer.list.invalidate(),
  });
  const removeMutation = trpc.freezer.remove.useMutation({
    onSuccess: () => utils.freezer.list.invalidate(),
  });

  const [addSearch, setAddSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const items: FreezerItem[] = freezerQuery.data ?? [];
  const existingRecipeIds = useMemo(
    () => new Set(items.map((i) => i.recipeId)),
    [items],
  );

  const filteredRecipes = useMemo(() => {
    const allRecipes = (recipesQuery.data?.items ?? []) as {
      id: string;
      name: string;
      category: string;
    }[];
    if (!addSearch.trim()) return allRecipes.filter((r) => !existingRecipeIds.has(r.id));
    const term = addSearch.toLowerCase();
    return allRecipes.filter(
      (r) => r.name.toLowerCase().includes(term) && !existingRecipeIds.has(r.id),
    );
  }, [recipesQuery.data, addSearch, existingRecipeIds]);

  const handleQuantityChange = useCallback(
    (recipeId: string, delta: number) => {
      const item = items.find((i) => i.recipeId === recipeId);
      const newQty = Math.max(0, (item?.quantity ?? 0) + delta);
      if (newQty <= 0) {
        removeMutation.mutate({ recipeId });
      } else {
        upsertMutation.mutate({ recipeId, quantity: newQty });
      }
    },
    [items, upsertMutation, removeMutation],
  );

  const handleSetQuantity = useCallback(
    (recipeId: string) => {
      const qty = parseInt(editValue, 10);
      if (isNaN(qty) || qty < 0) return;
      if (qty === 0) {
        removeMutation.mutate({ recipeId });
      } else {
        upsertMutation.mutate({ recipeId, quantity: qty });
      }
      setEditingId(null);
    },
    [editValue, upsertMutation, removeMutation],
  );

  const handleAddRecipe = useCallback(
    (recipeId: string) => {
      upsertMutation.mutate({ recipeId, quantity: 1 });
      setAddSearch("");
    },
    [upsertMutation],
  );

  const totalPortions = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items],
  );

  if (freezerQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Laster fryserinnhold...</p>;
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {items.length} oppskrifter, {totalPortions} porsjoner totalt
        </p>
      </div>

      {/* Inventory table */}
      <div className="space-y-1">
        {items.map((item) => (
          <div
            key={item.recipeId}
            className="flex items-center gap-3 rounded-lg border px-3 py-2 bg-card"
          >
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium">{item.recipeName}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                ({item.recipeCategory})
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="rounded border px-2 py-0.5 text-sm hover:bg-accent"
                onClick={() => handleQuantityChange(item.recipeId, -1)}
              >
                -
              </button>
              {editingId === item.recipeId ? (
                <input
                  type="number"
                  min={0}
                  className="w-14 rounded border px-1 py-0.5 text-center text-sm"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => handleSetQuantity(item.recipeId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSetQuantity(item.recipeId);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  className="w-10 text-center font-mono text-sm hover:underline"
                  onClick={() => {
                    setEditingId(item.recipeId);
                    setEditValue(String(item.quantity));
                  }}
                  title="Klikk for å redigere antall"
                >
                  {item.quantity}
                </button>
              )}
              <button
                type="button"
                className="rounded border px-2 py-0.5 text-sm hover:bg-accent"
                onClick={() => handleQuantityChange(item.recipeId, 1)}
              >
                +
              </button>
              <button
                type="button"
                className="ml-1 rounded border border-red-200 px-2 py-0.5 text-sm text-red-600 hover:bg-red-50"
                onClick={() => removeMutation.mutate({ recipeId: item.recipeId })}
              >
                Fjern
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Fryseren er tom. Legg til måltider nedenfor.
          </p>
        )}
      </div>

      {/* Add new items */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Legg til i fryseren</h3>
        <input
          type="text"
          placeholder="Søk etter oppskrifter..."
          className="w-full rounded-lg border px-3 py-2 text-sm"
          value={addSearch}
          onChange={(e) => setAddSearch(e.target.value)}
        />
        {addSearch.trim() && (
          <div className="max-h-60 space-y-1 overflow-y-auto rounded-lg border p-2">
            {filteredRecipes.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">
                Ingen oppskrifter funnet
              </p>
            ) : (
              filteredRecipes.slice(0, 20).map((recipe) => (
                <button
                  key={recipe.id}
                  type="button"
                  className="w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-accent transition-colors"
                  onClick={() => handleAddRecipe(recipe.id)}
                >
                  {recipe.name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({recipe.category})
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
