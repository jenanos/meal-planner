"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "../../lib/trpcClient";
import { Button, Input, ScrollArea } from "@repo/ui";
import { CategoryEmoji } from "../components/CategoryEmoji";

type FreezerListItem = {
  id: string;
  recipeId: string;
  recipeName: string;
  recipeCategory: string;
  quantity: number;
  frozenAt: string;
  expiresAt: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function toInputDate(iso: string) {
  return iso.slice(0, 10);
}

function isExpired(expiresAt: string) {
  return new Date(expiresAt) < new Date();
}

function isExpiringSoon(expiresAt: string) {
  const twoWeeks = new Date();
  twoWeeks.setDate(twoWeeks.getDate() + 14);
  return new Date(expiresAt) < twoWeeks && !isExpired(expiresAt);
}

export default function FreezerPage() {
  const utils = trpc.useUtils();
  const freezerQuery = trpc.freezer.list.useQuery();
  const incrementMutation = trpc.freezer.increment.useMutation({
    onSuccess: () => utils.freezer.list.invalidate(),
  });
  const decrementMutation = trpc.freezer.decrement.useMutation({
    onSuccess: () => utils.freezer.list.invalidate(),
  });
  const removeMutation = trpc.freezer.remove.useMutation({
    onSuccess: () => utils.freezer.list.invalidate(),
  });
  const updateDatesMutation = trpc.freezer.updateDates.useMutation({
    onSuccess: () => utils.freezer.list.invalidate(),
  });

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingDatesFor, setEditingDatesFor] = useState<string | null>(null);

  const items: FreezerListItem[] = freezerQuery.data ?? [];
  const totalPortions = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items],
  );

  const expiredCount = useMemo(
    () => items.filter((i) => isExpired(i.expiresAt)).length,
    [items],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Fryseren</h1>
          <p className="text-sm text-muted-foreground">
            {items.length} oppskrifter, {totalPortions} porsjoner totalt
            {expiredCount > 0 && (
              <span className="text-red-600 ml-2">
                ({expiredCount} utgått)
              </span>
            )}
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
          Fryseren er tom. Trykk &quot;Legg til&quot; for å legge til måltider.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const expired = isExpired(item.expiresAt);
            const expiringSoon = isExpiringSoon(item.expiresAt);

            return (
              <div
                key={item.recipeId}
                className={`rounded-lg border p-3 bg-card ${expired ? "border-red-300 bg-red-50/50" : expiringSoon ? "border-amber-300 bg-amber-50/50" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <CategoryEmoji category={item.recipeCategory as any} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{item.recipeName}</div>
                    <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span>Frosset: {formatDate(item.frozenAt)}</span>
                      <span className={expired ? "text-red-600 font-medium" : expiringSoon ? "text-amber-600 font-medium" : ""}>
                        Utløper: {formatDate(item.expiresAt)}
                        {expired && " (utgått)"}
                        {expiringSoon && " (snart)"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      aria-label={`Reduser antall ${item.recipeName}`}
                      onClick={() => decrementMutation.mutate({ recipeId: item.recipeId })}
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
                      aria-label={`Øk antall ${item.recipeName}`}
                      onClick={() => incrementMutation.mutate({ recipeId: item.recipeId })}
                    >
                      +
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() =>
                        setEditingDatesFor(
                          editingDatesFor === item.recipeId ? null : item.recipeId,
                        )
                      }
                    >
                      Datoer
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                      aria-label={`Fjern ${item.recipeName} fra fryseren`}
                      onClick={() => removeMutation.mutate({ recipeId: item.recipeId })}
                    >
                      &times;
                    </Button>
                  </div>
                </div>

                {/* Inline date editor */}
                {editingDatesFor === item.recipeId && (
                  <DateEditor
                    frozenAt={item.frozenAt}
                    expiresAt={item.expiresAt}
                    onSave={(frozenAt, expiresAt) => {
                      updateDatesMutation.mutate({
                        recipeId: item.recipeId,
                        frozenAt: new Date(frozenAt).toISOString(),
                        expiresAt: new Date(expiresAt).toISOString(),
                      });
                      setEditingDatesFor(null);
                    }}
                    onCancel={() => setEditingDatesFor(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAddDialog && (
        <AddFreezerItemDialog
          existingRecipeIds={new Set(items.map((i) => i.recipeId))}
          onAdd={(recipeId) => {
            incrementMutation.mutate({ recipeId });
          }}
          onClose={() => setShowAddDialog(false)}
        />
      )}
    </div>
  );
}

function DateEditor({
  frozenAt,
  expiresAt,
  onSave,
  onCancel,
}: {
  frozenAt: string;
  expiresAt: string;
  onSave: (frozenAt: string, expiresAt: string) => void;
  onCancel: () => void;
}) {
  const [localFrozen, setLocalFrozen] = useState(toInputDate(frozenAt));
  const [localExpires, setLocalExpires] = useState(toInputDate(expiresAt));

  return (
    <div className="mt-2 flex flex-wrap items-end gap-3 border-t pt-2">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Frosset dato</label>
        <input
          type="date"
          className="rounded border px-2 py-1 text-sm"
          value={localFrozen}
          onChange={(e) => setLocalFrozen(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Utløpsdato</label>
        <input
          type="date"
          className="rounded border px-2 py-1 text-sm"
          value={localExpires}
          onChange={(e) => setLocalExpires(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSave(localFrozen, localExpires)}>
          Lagre
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Avbryt
        </Button>
      </div>
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

  // Debounce search term with useEffect
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const recipesQuery = trpc.recipe.list.useQuery({
    search: debouncedSearch || undefined,
    pageSize: 100,
  });

  const recipes = recipesQuery.data?.items ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Legg til i fryseren</h2>
          <Input
            placeholder="Søk etter oppskrifter..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
