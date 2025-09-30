"use client";
export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import { trpc } from "../../lib/trpcClient";
import { Button, Input } from "@repo/ui";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";
import { RecipeCard } from "./components/RecipeCard";

const CATEGORIES = ["FISK", "VEGETAR", "KYLLING", "STORFE", "ANNET"] as const;

export default function RecipesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("");

  // Fetch a larger page to approximate "all" for client-side filtering.
  const { data, isLoading, error } = trpc.recipe.list.useQuery({
    page,
    pageSize: 200,
    search: undefined, // we'll filter client-side for live matches
    category: (category as any) || undefined,
  });

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("VEGETAR");
  const [everyday, setEveryday] = useState(3);
  const [health, setHealth] = useState(4);
  const [ingName, setIngName] = useState("");
  const [ingList, setIngList] = useState<Array<{ name: string }>>([]);

  const create = trpc.recipe.create.useMutation({
    onSuccess: () => {
      setName("");
      setDesc("");
      setIngName("");
      setIngList([]);
      // Refresh the grid
      setPage(1);
    },
  });

  type RecipeListItem = inferRouterOutputs<AppRouter>["recipe"]["list"]["items"][number];

  const allItems = useMemo(() => data?.items ?? [], [data]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return allItems;
    return allItems.filter((r) => {
      const ingredientText = (r.ingredients ?? [])
        .map((ri: any) => ri?.name ?? "")
        .join(" ");
      const hay = `${r.name} ${r.category ?? ""} ${r.description ?? ""} ${ingredientText}`.toLowerCase();
      return hay.includes(term);
    });
  }, [allItems, search]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-center">Oppskrifter</h1>

      {/* Search + Category, styled like planner's search */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-full flex justify-center">
          <div className="w-full max-w-md flex items-center gap-2">
            <Input
              placeholder="Søk etter oppskrifter"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="border bg-background rounded-md px-2 py-2 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Alle</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <Button type="button" onClick={() => setPage(1)}>
              Oppdater
            </Button>
          </div>
        </div>
        {isLoading ? (
          <p className="text-xs text-center text-muted-foreground">Laster…</p>
        ) : null}
        {error ? (
          <p className="text-sm text-center text-red-500">Kunne ikke laste</p>
        ) : null}
      </div>

      {/* 7-wide responsive grid like planner */}
      <div className="overflow-x-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 justify-items-center xl:min-w-[840px]">
          {filtered.map((r: RecipeListItem, idx) => (
            <RecipeCard key={r.id} recipe={{ id: r.id, name: r.name, category: r.category }} index={idx} />
          ))}
        </div>
      </div>

      {/* Create recipe form remains below */}
      <form
        className="space-y-3 border-t pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name || create.isPending) return;
          create.mutate({
            name,
            description: desc || undefined,
            category: cat,
            everydayScore: everyday,
            healthScore: health,
            ingredients: ingList,
          });
        }}
      >
        <h2 className="font-semibold">Ny oppskrift</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col">
            <label className="text-sm">Navn</label>
            <input className="border px-2 py-1" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex flex-col">
            <label className="text-sm">Kategori</label>
            <select className="border px-2 py-1" value={cat} onChange={(e) => setCat(e.target.value as any)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-sm">Hverdags-score</label>
            <input
              type="number"
              min={1}
              max={5}
              className="border px-2 py-1"
              value={everyday}
              onChange={(e) => setEveryday(parseInt(e.target.value, 10) || 1)}
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm">Helse-score</label>
            <input
              type="number"
              min={1}
              max={5}
              className="border px-2 py-1"
              value={health}
              onChange={(e) => setHealth(parseInt(e.target.value, 10) || 1)}
            />
          </div>
          <div className="flex flex-col sm:col-span-2">
            <label className="text-sm">Beskrivelse</label>
            <textarea className="border px-2 py-1" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm">Ingredienser</label>
          <div className="flex gap-2">
            <input
              className="border px-2 py-1 flex-1"
              value={ingName}
              onChange={(e) => setIngName(e.target.value)}
              placeholder="f.eks. løk"
            />
            <Button
              type="button"
              onClick={() => {
                const n = ingName.trim();
                if (!n) return;
                if (!ingList.some((i) => i.name.toLowerCase() === n.toLowerCase())) {
                  setIngList([...ingList, { name: n }]);
                }
                setIngName("");
              }}
            >
              Legg til
            </Button>
          </div>
          {ingList.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {ingList.map((i) => (
                <span key={i.name} className="inline-flex items-center gap-2 border rounded-sm px-2 py-1 text-sm">
                  {i.name}
                  <button
                    type="button"
                    className="text-red-600"
                    onClick={() => setIngList(ingList.filter((x) => x.name !== i.name))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Oppretter…" : "Opprett"}
        </Button>
      </form>
    </div>
  );
}
