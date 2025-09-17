"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "../../lib/trpcClient";
import { Button } from "@repo/ui";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";
import { describeEveryday, describeHealth } from "../../lib/scoreLabels";

type GenOutput = inferRouterOutputs<AppRouter>["planner"]["generateWeekPlan"];
type WeekDay = GenOutput["days"][number];
type WeekRecipe = WeekDay["recipe"];
type RecipeDTO = NonNullable<WeekRecipe>;
type WeekState = WeekRecipe[];

const DAY_NAMES = [
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
  "Søndag",
] as const;

function mondayOf(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

const makeEmptyWeek = (): WeekState => Array.from({ length: 7 }, () => null);

export default function PlannerPage() {
  const utils = trpc.useUtils();

  const [weekStartISO, setWeekStartISO] = useState(mondayOf());
  const [week, setWeek] = useState<WeekState>(makeEmptyWeek);
  const [longGap, setLongGap] = useState<RecipeDTO[]>([]);
  const [frequent, setFrequent] = useState<RecipeDTO[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<RecipeDTO[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const gen = trpc.planner.generateWeekPlan.useMutation();
  const save = trpc.planner.saveWeekPlan.useMutation();

  const selectedIds = useMemo(
    () => week.filter((r): r is RecipeDTO => !!r).map((r) => r.id),
    [week]
  );

  const applyWeekData = (res: GenOutput) => {
    const nextWeek = res.days.map((d) => d.recipe ?? null) as WeekState;
    const nextSelected = new Set(nextWeek.filter((r): r is RecipeDTO => !!r).map((r) => r.id));

    setWeek(nextWeek);
    setLongGap((res.alternatives?.longGap ?? []).filter((r) => !nextSelected.has(r.id)));
    setFrequent((res.alternatives?.frequent ?? []).filter((r) => !nextSelected.has(r.id)));
    setSearchResults([]);
    setSearchError(null);
  };

  useEffect(() => {
    gen.mutate(undefined, { onSuccess: applyWeekData });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSave = week.every((r) => !!r?.id);

  const handleSelect = (recipe: RecipeDTO) => {
    const emptyIndex = week.findIndex((x) => !x);
    if (emptyIndex === -1) return;
    const next = [...week];
    next[emptyIndex] = recipe;
    setWeek(next);
    setLongGap((prev) => prev.filter((r) => r.id !== recipe.id));
    setFrequent((prev) => prev.filter((r) => r.id !== recipe.id));
    setSearchResults((prev) => prev.filter((r) => r.id !== recipe.id));
  };

  const refreshSuggestions = async (type: "longGap" | "frequent") => {
    try {
      const data = await utils.planner.suggestions.fetch({
        type,
        excludeIds: selectedIds,
        limit: 6,
      });
      if (type === "longGap") setLongGap(data as RecipeDTO[]);
      else setFrequent(data as RecipeDTO[]);
    } catch (err) {
      console.error("Failed to refresh suggestions", err);
    }
  };

  const executeSearch = async () => {
    const term = searchTerm.trim();
    if (!term) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    try {
      const data = await utils.planner.suggestions.fetch({
        type: "search",
        search: term,
        excludeIds: selectedIds,
        limit: 10,
      });
      const filtered = (data as RecipeDTO[]).filter((r) => !selectedIds.includes(r.id));
      setSearchResults(filtered);
      setSearchError(filtered.length ? null : "Ingen treff");
    } catch (err) {
      setSearchError("Kunne ikke søke akkurat nå");
    } finally {
      setSearchLoading(false);
    }
  };

  const dayCards = week.map((recipe, idx) => (
    <div key={idx} className="border rounded p-3 bg-white">
      <div className="text-xs text-gray-500">{DAY_NAMES[idx]}</div>
      <div className="font-medium">{recipe?.name ?? "—"}</div>
      <div className="text-xs text-gray-500">{recipe?.category ?? ""}</div>
      {recipe ? (
        <div className="text-xs text-gray-400">
          {describeEveryday(recipe.everydayScore)} • {describeHealth(recipe.healthScore)}
        </div>
      ) : (
        <div className="text-xs text-gray-300">Ingen valgt</div>
      )}
      {recipe?.ingredients?.length ? (
        <ul className="list-disc pl-5 text-xs mt-2">
          {recipe.ingredients.map((i) => (
            <li key={i.ingredientId}>{i.name}</li>
          ))}
        </ul>
      ) : null}
    </div>
  ));

  const renderRecipeCard = (recipe: RecipeDTO) => (
    <button
      key={recipe.id}
      className="text-left border rounded p-2 hover:bg-gray-50"
      onClick={() => handleSelect(recipe)}
      type="button"
    >
      <div className="font-medium">{recipe.name}</div>
      <div className="text-xs text-gray-500">
        {recipe.category} • {describeEveryday(recipe.everydayScore)} • {describeHealth(recipe.healthScore)}
      </div>
    </button>
  );

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-center">Ukesplan</h1>

      <div className="flex gap-3 justify-center items-end flex-wrap">
        <div className="flex flex-col">
          <label className="text-sm">Uke som starter</label>
          <input
            type="date"
            className="border px-2 py-1"
            value={new Date(weekStartISO).toISOString().slice(0, 10)}
            onChange={(e) => setWeekStartISO(new Date(e.target.value).toISOString())}
          />
        </div>
        <Button
          onClick={() =>
            gen.mutate(undefined, {
              onSuccess: applyWeekData,
            })
          }
        >
          {gen.isPending ? "Genererer…" : "Generer ny uke"}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 min-w-[840px]">
          {dayCards}
        </div>
      </div>

      <div className="space-y-4">
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Lenge siden sist</h2>
            <Button type="button" variant="outline" onClick={() => refreshSuggestions("longGap")}>
              Generer
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {longGap.map(renderRecipeCard)}
            {!longGap.length && <p className="text-sm text-gray-500">Ingen forslag akkurat nå</p>}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Ofte brukt</h2>
            <Button type="button" variant="outline" onClick={() => refreshSuggestions("frequent")}>
              Generer
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {frequent.map(renderRecipeCard)}
            {!frequent.length && <p className="text-sm text-gray-500">Ingen forslag akkurat nå</p>}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-end sm:gap-3">
            <div className="flex-1 flex flex-col">
              <label className="text-sm">Søk i alle oppskrifter</label>
              <input
                className="border px-2 py-1"
                placeholder="For eksempel linsegryte"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-2 mt-2 sm:mt-0">
              <Button type="button" onClick={executeSearch} disabled={searchLoading}>
                {searchLoading ? "Søker…" : "Søk"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSearchTerm("");
                  setSearchResults([]);
                  setSearchError(null);
                }}
              >
                Tøm
              </Button>
            </div>
          </div>
          {searchError && <p className="text-sm text-red-500">{searchError}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {searchResults.map(renderRecipeCard)}
            {!searchResults.length && !searchError && (
              <p className="text-sm text-gray-500">Søk for å hente forslag</p>
            )}
          </div>
        </section>
      </div>

      <div className="flex justify-center">
        <Button
          disabled={!canSave || save.isPending}
          onClick={() => {
            if (!canSave || save.isPending) return;
            const ids = week.map((r) => (r as RecipeDTO).id);
            save.mutate({
              weekStart: weekStartISO,
              recipeIdsByDay: ids,
            });
          }}
        >
          {save.isPending ? "Lagrer…" : "Lagre ukeplan"}
        </Button>
      </div>

      {(gen.error || save.error) && (
        <p className="text-center text-sm text-red-500">Noe gikk galt. Prøv igjen.</p>
      )}
    </div>
  );
}
