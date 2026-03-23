"use client";

import React, { useCallback, useMemo, useState } from "react";
import { trpc } from "../../lib/trpcClient";
import { Badge, Button, Input } from "@repo/ui";

type PackageItem = {
  id: string;
  displayName: string;
  extraItemCatalogId: string | null;
  ingredientId: string | null;
};

type Package = {
  id: string;
  name: string;
  items: PackageItem[];
};

type NewItem = {
  displayName: string;
  extraItemCatalogId?: string;
  ingredientId?: string;
};

export function PackagesBoard() {
  const utils = trpc.useUtils();
  const { data: packages = [], isLoading } =
    trpc.planner.packageList.useQuery();
  const createMutation = trpc.planner.packageCreate.useMutation({
    onSuccess: () => utils.planner.packageList.invalidate(),
  });
  const updateMutation = trpc.planner.packageUpdate.useMutation({
    onSuccess: () => utils.planner.packageList.invalidate(),
  });
  const deleteMutation = trpc.planner.packageDelete.useMutation({
    onSuccess: () => utils.planner.packageList.invalidate(),
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  if (isLoading) {
    return <p className="p-4 text-muted-foreground">Laster pakker…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          onClick={() => setIsCreating(true)}
          disabled={isCreating}
        >
          + Ny pakke
        </Button>
      </div>

      {isCreating && (
        <PackageEditor
          onSave={async (name, items) => {
            await createMutation.mutateAsync({ name, items });
            setIsCreating(false);
          }}
          onCancel={() => setIsCreating(false)}
          isSaving={createMutation.isPending}
        />
      )}

      {(packages as Package[]).length === 0 && !isCreating ? (
        <p className="text-sm text-muted-foreground">
          Ingen pakker opprettet ennå.
        </p>
      ) : (
        <div className="grid gap-4">
          {(packages as Package[]).map((pkg) =>
            editingId === pkg.id ? (
              <PackageEditor
                key={pkg.id}
                initialName={pkg.name}
                initialItems={pkg.items}
                onSave={async (name, items) => {
                  await updateMutation.mutateAsync({
                    id: pkg.id,
                    name,
                    items,
                  });
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
                onDelete={async () => {
                  await deleteMutation.mutateAsync({ id: pkg.id });
                  setEditingId(null);
                }}
                isSaving={updateMutation.isPending}
              />
            ) : (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                onEdit={() => setEditingId(pkg.id)}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function PackageCard({ pkg, onEdit }: { pkg: Package; onEdit: () => void }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">{pkg.name}</h3>
        <Button variant="outline" size="sm" onClick={onEdit}>
          Rediger
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {pkg.items.map((item) => (
          <Badge key={item.id} variant="secondary">
            {item.displayName}
          </Badge>
        ))}
        {pkg.items.length === 0 && (
          <span className="text-xs text-muted-foreground">Ingen elementer</span>
        )}
      </div>
    </div>
  );
}

function PackageEditor({
  initialName = "",
  initialItems = [],
  onSave,
  onCancel,
  onDelete,
  isSaving,
}: {
  initialName?: string;
  initialItems?: PackageItem[];
  onSave: (name: string, items: NewItem[]) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
  isSaving: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [items, setItems] = useState<NewItem[]>(
    initialItems.map((i) => ({
      displayName: i.displayName,
      extraItemCatalogId: i.extraItemCatalogId ?? undefined,
      ingredientId: i.ingredientId ?? undefined,
    })),
  );
  const [itemSearch, setItemSearch] = useState("");

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground">
          Pakkenavn
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="F.eks. Pålegg"
          className="mt-1"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">
          Elementer i pakken
        </label>
        <div className="flex flex-wrap gap-1.5 mt-1 min-h-[32px]">
          {items.map((item, idx) => (
            <Badge
              asChild
              key={idx}
              className="cursor-pointer border border-blue-500 bg-blue-500 text-white hover:bg-red-500 hover:border-red-500"
            >
              <button
                type="button"
                onClick={() =>
                  setItems((prev) => prev.filter((_, i) => i !== idx))
                }
              >
                {item.displayName} ×
              </button>
            </Badge>
          ))}
          {items.length === 0 && (
            <span className="text-xs text-muted-foreground">
              Legg til elementer nedenfor
            </span>
          )}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">
          Søk og legg til elementer
        </label>
        <Input
          value={itemSearch}
          onChange={(e) => setItemSearch(e.target.value)}
          placeholder="Søk etter ingrediens eller element…"
          className="mt-1"
        />
        {itemSearch.trim().length > 0 && (
          <ItemSuggestions
            search={itemSearch}
            currentItems={items}
            onAdd={(item) => {
              setItems((prev) => [...prev, item]);
              setItemSearch("");
            }}
          />
        )}
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          size="sm"
          disabled={!name.trim() || items.length === 0 || isSaving}
          onClick={() => onSave(name.trim(), items)}
        >
          {isSaving ? "Lagrer…" : "Lagre"}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Avbryt
        </Button>
        {onDelete && (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto text-red-600 hover:bg-red-50"
            onClick={onDelete}
          >
            Slett
          </Button>
        )}
      </div>
    </div>
  );
}

function ItemSuggestions({
  search,
  currentItems,
  onAdd,
}: {
  search: string;
  currentItems: NewItem[];
  onAdd: (item: NewItem) => void;
}) {
  const { data: extraSuggestions = [] } = trpc.planner.extraSuggest.useQuery(
    { search },
    { enabled: search.trim().length > 0 },
  );
  const { data: ingredients = [] } = trpc.ingredient.list.useQuery(
    { search },
    { enabled: search.trim().length > 0 },
  );

  const currentNames = useMemo(
    () => new Set(currentItems.map((i) => i.displayName.toLowerCase())),
    [currentItems],
  );

  const filteredExtras = (
    extraSuggestions as Array<{
      id: string;
      name: string;
      hasCategory: boolean;
    }>
  ).filter((e) => !currentNames.has(e.name.toLowerCase()));

  const filteredIngredients = (
    ingredients as Array<{ id: string; name: string }>
  ).filter(
    (ing) =>
      !currentNames.has(ing.name.toLowerCase()) &&
      !filteredExtras.some(
        (e) => e.name.toLowerCase() === ing.name.toLowerCase(),
      ),
  );

  const exactMatch =
    filteredExtras.some(
      (e) => e.name.toLowerCase() === search.trim().toLowerCase(),
    ) ||
    filteredIngredients.some(
      (i) => i.name.toLowerCase() === search.trim().toLowerCase(),
    ) ||
    currentNames.has(search.trim().toLowerCase());

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {filteredExtras.map((e) => (
        <Badge
          asChild
          key={`extra-${e.id}`}
          className={`cursor-pointer border text-white ${
            e.hasCategory
              ? "border-emerald-500 bg-emerald-500 hover:bg-emerald-600"
              : "border-orange-500 bg-orange-500 hover:bg-orange-600"
          }`}
        >
          <button
            type="button"
            onClick={() =>
              onAdd({ displayName: e.name, extraItemCatalogId: e.id })
            }
          >
            {e.name}
          </button>
        </Badge>
      ))}
      {filteredIngredients.map((ing) => (
        <Badge
          asChild
          key={`ing-${ing.id}`}
          className="cursor-pointer border border-violet-500 bg-violet-500 text-white hover:bg-violet-600"
        >
          <button
            type="button"
            onClick={() =>
              onAdd({ displayName: ing.name, ingredientId: ing.id })
            }
          >
            {ing.name}
          </button>
        </Badge>
      ))}
      {!exactMatch && search.trim() && (
        <Badge
          asChild
          className="cursor-pointer border border-orange-500 bg-orange-500 text-white hover:bg-orange-600"
        >
          <button
            type="button"
            onClick={() => onAdd({ displayName: search.trim() })}
          >
            Legg til &quot;{search.trim()}&quot;
          </button>
        </Badge>
      )}
    </div>
  );
}
