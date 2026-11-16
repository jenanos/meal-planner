"use client";
export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import { trpc } from "../../lib/trpcClient";

import { ListToolbar } from "../components/ListToolbar";
import { RecipeCard } from "./components/RecipeCard";
import { RecipeSheets } from "./components/RecipeSheets";
import type { RecipeListItem } from "./types";
import { useRecipeDialogState } from "./hooks/useRecipeDialogState";

type RecipeIngredientSummary = {
  name?: string;
};

export default function RecipesPage() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = trpc.recipe.list.useQuery({
    page,
    pageSize: 200,
    search: undefined,
    category: undefined,
  });

  const allItems = useMemo<RecipeListItem[]>(() => {
    const items = data?.items ?? [];
    return items as RecipeListItem[];
  }, [data]);

  const recipeDialogs = useRecipeDialogState({
    recipes: allItems,
    onCreateSuccess: async () => {
      setPage(1);
      await utils.recipe.list.invalidate().catch(() => undefined);
    },
    onUpdateSuccess: async () => {
      await utils.recipe.list.invalidate().catch(() => undefined);
    },
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return allItems;
    return allItems.filter((recipe) => {
      const ingredientText = (recipe.ingredients ?? [])
        .map((ri: RecipeIngredientSummary | undefined) => ri?.name ?? "")
        .join(" ");
      const hay = `${recipe.name} ${recipe.category ?? ""} ${recipe.description ?? ""} ${ingredientText}`.toLowerCase();
      return hay.includes(term);
    });
  }, [allItems, search]);

  return (
    <div className="space-y-5 max-md:pb-16">
      <h1 className="hidden text-xl font-bold text-center md:block">Oppskrifter</h1>
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Søk etter oppskrifter"
        addLabel="Ny oppskrift"
        onAdd={recipeDialogs.openCreate}
      />
      {isLoading ? <p className="text-sm text-muted-foreground">Laster…</p> : null}
      {error ? <p className="text-sm text-destructive">Kunne ikke laste oppskriftene.</p> : null}
      {!isLoading && !error && filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {search.trim() ? "Ingen oppskrifter passer søket." : "Ingen oppskrifter ennå."}
        </p>
      ) : null}

      <RecipeSheets state={recipeDialogs} />

      <div className="overflow-x-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 justify-items-center xl:min-w-[840px]">
          {filtered.map((r: RecipeListItem, idx) => (
            <RecipeCard
              key={r.id}
              recipe={{ id: r.id, name: r.name, category: r.category }}
              index={idx}
              onClick={() => recipeDialogs.openView(r.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
