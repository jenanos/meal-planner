"use client";

import { useCallback, useMemo, useState } from "react";
import { trpc } from "../../lib/trpcClient";
import { Button, Input, ScrollArea } from "@repo/ui";
import { CategoryEmoji } from "../components/CategoryEmoji";

type FreezerListItem = {
  id: string;
  recipeId: string;
  recipeName: string;
  recipeCategory: string;
  quantity: number;
};

export default function FreezerPage() {
  const utils = trpc.useUtils();
  const freezerQuery = trpc.freezer.list.useQuery();
  const upsertMutation = trpc.freezer.upsert.useMutation({
    onSuccess: () => utils.freezer.list.invalidate(),
  });
  const removeMutation = trpc.freezer.remove.useMutation({
    onSuccess: () => utils.freezer.list.invalidate(),
  });

  const [showAddDialog, setShowAddDialog] = useState(false);

  const items: FreezerListItem[] = freezerQuery.data ?? [];
  const totalPortions = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items],
  );

  const handleQuantityChange = useCallback(
    (recipeId: string, delta: number) => {
      const item = items.find((i) => i.recipeId === recipeId);
      const newQty = (item?.quantity ?? 0) + delta;
      if (newQty <= 0) {
        removeMutation.mutate({ recipeId });
      } else {
        upsertMutation.mutate({ recipeId, quantity: newQty });
      }
    },
    [items, upsertMutation, removeMutation],
  );

  const handleRemove = useCallback(
    (recipeId: string) => {
      removeMutation.mutate({ recipeId });
    },
    [removeMutation],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Fryseren</h1>
          <p className="text-sm text-muted-foreground">
            {items.length} oppskrifter, {totalPortions} porsjoner totalt
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>Legg til</Button>
      </div>

      {freezerQuery.isLoading ? (
        <p className="text-center text-muted-foreground py-8">
          Laster fryserinnhold...
        </p>
      ) : items.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          Fryseren er tom. Trykk &quot;Legg til&quot; for a legge til maltider.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.recipeId}
              className="flex items-center gap-3 rounded-lg border p-3 bg-card"
            >
              <CategoryEmoji category={item.recipeCategory as any} />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{item.recipeName}</div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => handleQuantityChange(item.recipeId, -1)}
                >
                  -
                </Button>
                <span className="w-8 text-center font-mono text-sm">
                  {item.quantity}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => handleQuantityChange(item.recipeId, 1)}
                >
                  +
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                  onClick={() => handleRemove(item.recipeId)}
                >
                  x
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddDialog && (
        <AddFreezerItemDialog
          existingRecipeIds={new Set(items.map((i) => i.recipeId))}
          onAdd={(recipeId) => {
            const existing = items.find((i) => i.recipeId === recipeId);
            upsertMutation.mutate({
              recipeId,
              quantity: (existing?.quantity ?? 0) + 1,
            });
          }}
          onClose={() => setShowAddDialog(false)}
        />
      )}
    </div>
  );
}

function AddFreezerItemDialog({
  existingRecipeIds,
  onAdd,
  onClose,
}: {
  existingRecipeIds: Set<string>;
  onAdd: (recipeId: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce
  useState(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timeout);
  });

  const recipesQuery = trpc.recipe.list.useQuery({
    search: debouncedSearch || undefined,
    pageSize: 100,
  });

  // Update debounced search on change
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    // Simple immediate debounce for responsiveness
    const timeout = setTimeout(() => setDebouncedSearch(value), 300);
    return () => clearTimeout(timeout);
  }, []);

  const recipes = recipesQuery.data?.items ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Legg til i fryseren</h2>
          <Input
            placeholder="Sok etter oppskrifter..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="mt-2"
            autoFocus
          />
        </div>
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-2">
            {recipesQuery.isLoading ? (
              <p className="text-center text-muted-foreground py-4">
                Laster...
              </p>
            ) : recipes.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                Ingen oppskrifter funnet
              </p>
            ) : (
              recipes.map((recipe: any) => (
                <button
                  key={recipe.id}
                  type="button"
                  className="w-full flex items-center gap-3 p-3 rounded-lg bg-accent/50 hover:bg-accent transition-colors text-left"
                  onClick={() => {
                    onAdd(recipe.id);
                    onClose();
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{recipe.name}</div>
                    {existingRecipeIds.has(recipe.id) && (
                      <div className="text-xs text-cyan-600">
                        Allerede i fryseren
                      </div>
                    )}
                  </div>
                  {recipe.category && (
                    <CategoryEmoji category={recipe.category as any} />
                  )}
                </button>
              ))
            )}
          </div>
        </ScrollArea>
        <div className="p-4 border-t">
          <Button variant="ghost" className="w-full" onClick={onClose}>
            Avbryt
          </Button>
        </div>
      </div>
    </div>
  );
}
