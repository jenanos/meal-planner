"use client";
export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import { trpc } from "../../lib/trpcClient";
import { Button } from "@repo/ui";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";

const CATEGORIES = ["FISK", "VEGETAR", "KYLLING", "STORFE", "ANNET"] as const;

export default function RecipesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("");

  const { data, isLoading, error } = trpc.recipe.list.useQuery({
    page,
    pageSize: 20,
    search: search || undefined,
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
      // Refresh
      setPage(1);
    },
  });

  const items = useMemo(() => data?.items ?? [], [data]);

  type RecipeListItem = inferRouterOutputs<AppRouter>["recipe"]["list"]["items"][number];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Recipes</h1>

      <div className="flex gap-2 items-end">
        <div className="flex flex-col">
          <label className="text-sm">Search</label>
          <input className="border px-2 py-1" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-col">
          <label className="text-sm">Category</label>
          <select className="border px-2 py-1" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <Button type="button" onClick={() => setPage(1)}>Filter</Button>
      </div>

      <ul className="space-y-2">
        {isLoading && <li>Loading…</li>}
        {error && <li className="text-red-500">Failed to load</li>}
        {items.map((r: RecipeListItem) => (
          <li key={r.id} className="border rounded p-3">
            <div className="font-medium">{r.name} <span className="text-xs text-gray-500">({r.category})</span></div>
            <div className="text-xs text-gray-500">Everyday {r.everydayScore} • Health {r.healthScore}</div>
            {r.description && <div className="text-sm mt-1">{r.description}</div>}
            {r.ingredients?.length ? (
              <ul className="list-disc pl-6 text-sm text-gray-600 mt-1">
                {r.ingredients.map((ri: any) => (
                  <li key={ri.ingredientId}>{ri.name}{ri.quantity ? ` – ${ri.quantity}` : ""}</li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-gray-400">No ingredients</div>
            )}
          </li>
        ))}
      </ul>

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
        <h2 className="font-semibold">Create recipe</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col">
            <label className="text-sm">Name</label>
            <input className="border px-2 py-1" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex flex-col">
            <label className="text-sm">Category</label>
            <select className="border px-2 py-1" value={cat} onChange={(e) => setCat(e.target.value as any)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-sm">Everyday score</label>
            <input type="number" min={1} max={5} className="border px-2 py-1" value={everyday} onChange={(e) => setEveryday(parseInt(e.target.value, 10) || 1)} />
          </div>
          <div className="flex flex-col">
            <label className="text-sm">Health score</label>
            <input type="number" min={1} max={5} className="border px-2 py-1" value={health} onChange={(e) => setHealth(parseInt(e.target.value, 10) || 1)} />
          </div>
          <div className="flex flex-col sm:col-span-2">
            <label className="text-sm">Description</label>
            <textarea className="border px-2 py-1" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm">Ingredients</label>
          <div className="flex gap-2">
            <input className="border px-2 py-1 flex-1" value={ingName} onChange={(e) => setIngName(e.target.value)} placeholder="e.g. løk" />
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
              Add
            </Button>
          </div>
          {ingList.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {ingList.map((i) => (
                <span key={i.name} className="inline-flex items-center gap-2 border rounded px-2 py-1 text-sm">
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
          {create.isPending ? "Creating…" : "Create"}
        </Button>
      </form>
    </div>
  );
}
