"use client";
export const dynamic = "force-dynamic";

import type { DragEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { trpc } from "../../lib/trpcClient";
import { Button } from "@repo/ui";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";
import { describeEveryday, describeHealth } from "../../lib/scoreLabels";

const DAY_NAMES = [
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
  "Søndag",
] as const;

const MS_PER_DAY = 86_400_000;

type PlannerOutputs = inferRouterOutputs<AppRouter>["planner"];
type WeekPlanResult = PlannerOutputs["getWeekPlan"];
type WeekDay = WeekPlanResult["days"][number];
type WeekRecipe = WeekDay["recipe"];
type RecipeDTO = NonNullable<WeekRecipe>;
type WeekState = (RecipeDTO | null)[];

type DragSource = "week" | "longGap" | "frequent" | "search";

type DragPayload = {
  source: DragSource;
  index: number;
  recipeId: string;
};

function startOfWeekISO(dateInput?: string | Date) {
  const date = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date value");
  }
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  utc.setUTCDate(utc.getUTCDate() + diff);
  utc.setUTCHours(0, 0, 0, 0);
  return utc.toISOString();
}

function addWeeksISO(weekStartISO: string, weeks: number) {
  const date = new Date(weekStartISO);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return startOfWeekISO(date);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatWeekRange(weekStartISO: string) {
  const formatter = new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "short",
  });

  const start = new Date(weekStartISO);
  const end = addDays(new Date(weekStartISO), 6);
  return `${formatter.format(start)}–${formatter.format(end)}`;
}

function deriveWeekLabel(weekStartISO: string, currentWeekISO: string) {
  const diffWeeks = Math.round(
    (new Date(weekStartISO).getTime() - new Date(currentWeekISO).getTime()) /
      (7 * MS_PER_DAY)
  );

  let prefix = "Denne uken";
  if (diffWeeks === 1) prefix = "Neste uke";
  else if (diffWeeks === -1) prefix = "Forrige uke";
  else if (diffWeeks >= 2) prefix = "Kommende";
  else if (diffWeeks <= -2) prefix = "Tidligere";

  return `${prefix} (${formatWeekRange(weekStartISO)})`;
}

function makeEmptyWeek() {
  return Array.from({ length: 7 }, () => null) as WeekState;
}

function lowerIdSet(items: RecipeDTO[]) {
  return new Set(items.map((item) => item.id));
}

export default function PlannerPage() {
  const utils = trpc.useUtils();
  const [activeWeekStart, setActiveWeekStart] = useState(() => startOfWeekISO());
  const [week, setWeek] = useState<WeekState>(makeEmptyWeek);
  const [longGap, setLongGap] = useState<RecipeDTO[]>([]);
  const [frequent, setFrequent] = useState<RecipeDTO[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<RecipeDTO[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [lastUpdatedISO, setLastUpdatedISO] = useState<string | null>(null);

  const weekPlanQuery = trpc.planner.getWeekPlan.useQuery(
    { weekStart: activeWeekStart },
    { enabled: Boolean(activeWeekStart) }
  );
  const timelineQuery = trpc.planner.weekTimeline.useQuery({ around: activeWeekStart });

  const generateWeek = trpc.planner.generateWeekPlan.useMutation();
  const saveWeek = trpc.planner.saveWeekPlan.useMutation();

  const selectedIds = useMemo(
    () => week.filter((recipe): recipe is RecipeDTO => Boolean(recipe)).map((recipe) => recipe.id),
    [week]
  );

  const applyWeekData = useCallback(
    (res: WeekPlanResult) => {
      const nextWeek = res.days.map((day) => day.recipe ?? null) as WeekState;
      const currentSet = lowerIdSet(nextWeek.filter((recipe): recipe is RecipeDTO => Boolean(recipe)));

      setWeek(nextWeek);
      setLongGap(res.suggestions.longGap.filter((item) => !currentSet.has(item.id)));
      setFrequent(res.suggestions.frequent.filter((item) => !currentSet.has(item.id)));
      setSearchResults([]);
      setSearchError(null);
      setLastUpdatedISO(res.updatedAt);
      utils.planner.getWeekPlan.setData({ weekStart: res.weekStart }, res);
    },
    [utils]
  );

  useEffect(() => {
    if (weekPlanQuery.data) {
      applyWeekData(weekPlanQuery.data);
    }
  }, [weekPlanQuery.data, applyWeekData]);

  useEffect(() => {
    if (!weekPlanQuery.data) return;
    const hasRecipes = week.some((recipe) => Boolean(recipe));
    if (hasRecipes || generateWeek.isPending || isAutoGenerating) return;

    setIsAutoGenerating(true);
    generateWeek.mutate(
      { weekStart: activeWeekStart },
      {
        onSuccess: (data) => {
          applyWeekData(data);
          timelineQuery.refetch().catch(() => undefined);
        },
        onSettled: () => setIsAutoGenerating(false),
      }
    );
  }, [
    weekPlanQuery.data,
    week,
    generateWeek,
    activeWeekStart,
    applyWeekData,
    timelineQuery,
    isAutoGenerating,
  ]);

  const commitWeekPlan = useCallback(
    async (nextWeek: WeekState, opts?: { suppressRefetch?: boolean }) => {
      setWeek(nextWeek);
      const ids = nextWeek.map((recipe) => recipe?.id).filter(Boolean) as string[];
      if (ids.length !== 7) {
        return;
      }

      try {
        const payload = await saveWeek.mutateAsync({
          weekStart: activeWeekStart,
          recipeIdsByDay: ids,
        });
        applyWeekData(payload);
        if (!opts?.suppressRefetch) {
          timelineQuery.refetch().catch(() => undefined);
        }
      } catch (err) {
        console.error("Kunne ikke lagre ukeplan", err);
      }
    },
    [activeWeekStart, saveWeek, applyWeekData, timelineQuery]
  );

  const refreshSuggestions = useCallback(
    async (type: "longGap" | "frequent") => {
      try {
        const data = (await utils.planner.suggestions.fetch({
          type,
          excludeIds: selectedIds,
          limit: type === "longGap" ? 6 : 6,
        })) as RecipeDTO[];
        if (type === "longGap") setLongGap(data);
        else setFrequent(data);
      } catch (err) {
        console.error("Failed to refresh suggestions", err);
      }
    },
    [utils, selectedIds]
  );

  const executeSearch = useCallback(async () => {
    const term = searchTerm.trim();
    if (!term) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    try {
      const data = (await utils.planner.suggestions.fetch({
        type: "search",
        search: term,
        excludeIds: selectedIds,
        limit: 12,
      })) as RecipeDTO[];
      const filtered = data.filter((recipe) => !selectedIds.includes(recipe.id));
      setSearchResults(filtered);
      setSearchError(filtered.length ? null : "Ingen treff");
    } catch (err) {
      setSearchError("Kunne ikke søke akkurat nå");
    } finally {
      setSearchLoading(false);
    }
  }, [searchTerm, utils, selectedIds]);

  const handleWeekCardDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>, targetIndex: number) => {
      event.preventDefault();
      setDragOverIndex(null);
      const payloadRaw = event.dataTransfer.getData("application/json");
      if (!payloadRaw) return;

      let payload: DragPayload | null = null;
      try {
        payload = JSON.parse(payloadRaw) as DragPayload;
      } catch (err) {
        console.error("Unknown drag payload", err);
        return;
      }
      if (!payload) return;

      if (payload.source === "week") {
        if (payload.index === targetIndex) return;
        const next = [...week];
        const [moved] = next.splice(payload.index, 1);
        next.splice(targetIndex, 0, moved);
        await commitWeekPlan(next);
        return;
      }

      const sourceLists: Record<DragSource, RecipeDTO[]> = {
        week: [],
        longGap,
        frequent,
        search: searchResults,
      };

      const sourceList = sourceLists[payload.source];
      const recipe = sourceList[payload.index];
      if (!recipe) return;

      const next = [...week];
      next[targetIndex] = recipe;
      await commitWeekPlan(next);

      if (payload.source === "longGap") {
        setLongGap((prev) => prev.filter((item) => item.id !== recipe.id));
      } else if (payload.source === "frequent") {
        setFrequent((prev) => prev.filter((item) => item.id !== recipe.id));
      } else if (payload.source === "search") {
        setSearchResults((prev) => prev.filter((item) => item.id !== recipe.id));
      }

    },
    [week, commitWeekPlan, longGap, frequent, searchResults]
  );

  const handleDragStart = useCallback((event: DragEvent, data: DragPayload) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/json", JSON.stringify(data));
    event.dataTransfer.setData("text/plain", data.recipeId);
  }, []);

  const timelineItems = useMemo(() => {
    if (!timelineQuery.data) return [] as Array<{ weekStart: string; label: string; hasEntries: boolean }>;

    const map = new Map<string, { weekStart: string; hasEntries: boolean }>();
    timelineQuery.data.weeks.forEach((weekInfo) => {
      map.set(weekInfo.weekStart, {
        weekStart: weekInfo.weekStart,
        hasEntries: weekInfo.hasEntries,
      });
    });

    const baseWeekStart = timelineQuery.data.currentWeekStart;
    if (baseWeekStart && !map.has(baseWeekStart)) {
      const existing = timelineQuery.data.weeks.find((week) => week.weekStart === baseWeekStart);
      map.set(baseWeekStart, {
        weekStart: baseWeekStart,
        hasEntries: existing?.hasEntries ?? false,
      });
    }

    [activeWeekStart, addWeeksISO(activeWeekStart, -1), addWeeksISO(activeWeekStart, 1), addWeeksISO(activeWeekStart, -2), addWeeksISO(activeWeekStart, 2)].forEach(
      (weekIso) => {
        if (!map.has(weekIso)) {
          map.set(weekIso, { weekStart: weekIso, hasEntries: false });
        }
      }
    );

    return Array.from(map.values())
      .sort((a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime())
      .map((item) => ({
        weekStart: item.weekStart,
        hasEntries: item.hasEntries,
        label: deriveWeekLabel(item.weekStart, activeWeekStart),
      }));
  }, [timelineQuery.data, activeWeekStart]);

  useEffect(() => {
    if (!timelineQuery.data) return;
    const { currentWeekStart, weeks } = timelineQuery.data;
    if (!weeks.some((week) => week.weekStart === activeWeekStart) && currentWeekStart) {
      setActiveWeekStart(currentWeekStart);
    }
  }, [timelineQuery.data, activeWeekStart]);

  const statusText = useMemo(() => {
    if (saveWeek.isPending) return "Lagrer endringer…";
    if (generateWeek.isPending || isAutoGenerating) return "Genererer forslag…";
    if (lastUpdatedISO) {
      const formatter = new Intl.DateTimeFormat("nb-NO", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      return `Sist oppdatert ${formatter.format(new Date(lastUpdatedISO))}`;
    }
    return "Endringer lagres automatisk";
  }, [saveWeek.isPending, generateWeek.isPending, isAutoGenerating, lastUpdatedISO]);

  const renderWeekCard = (recipe: WeekRecipe, index: number) => {
    const isDraggingTarget = dragOverIndex === index;
    return (
      <div
        key={index}
        className={`border rounded p-3 bg-white transition-colors ${
          isDraggingTarget ? "ring-2 ring-blue-400" : ""
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOverIndex(index);
        }}
        onDragLeave={() => setDragOverIndex((prev) => (prev === index ? null : prev))}
        onDrop={(event) => handleWeekCardDrop(event, index)}
        draggable={Boolean(recipe)}
        onDragStart={(event) => {
          if (!recipe) return;
          handleDragStart(event, { source: "week", index, recipeId: recipe.id });
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs text-gray-500">{DAY_NAMES[index]}</div>
            <div className="font-medium">{recipe?.name ?? "—"}</div>
            <div className="text-xs text-gray-500">{recipe?.category ?? ""}</div>
          </div>
        </div>
        {recipe ? (
          <div className="text-xs text-gray-400">
            {describeEveryday(recipe.everydayScore)} • {describeHealth(recipe.healthScore)}
          </div>
        ) : (
          <div className="text-xs text-gray-300">Ingen valgt</div>
        )}
        {recipe?.ingredients?.length ? (
          <ul className="list-disc pl-5 text-xs mt-2 space-y-1">
            {recipe.ingredients.map((ingredient) => (
              <li key={ingredient.ingredientId}>{ingredient.name}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  };

  const renderSuggestionCard = (recipe: RecipeDTO, source: DragSource, index: number) => (
    <button
      key={recipe.id}
      className="text-left border rounded p-2 hover:bg-gray-50 cursor-grab"
      onClick={async () => {
        const firstEmpty = week.findIndex((slot) => !slot);
        const targetIndex = firstEmpty === -1 ? 0 : firstEmpty;
        const next = [...week];
        next[targetIndex] = recipe;
        await commitWeekPlan(next);
        if (source === "longGap") setLongGap((prev) => prev.filter((item) => item.id !== recipe.id));
        if (source === "frequent") setFrequent((prev) => prev.filter((item) => item.id !== recipe.id));
        if (source === "search") setSearchResults((prev) => prev.filter((item) => item.id !== recipe.id));
      }}
      draggable
      onDragStart={(event) => handleDragStart(event, { source, index, recipeId: recipe.id })}
      type="button"
    >
      <div className="font-medium">{recipe.name}</div>
      <div className="text-xs text-gray-500">
        {recipe.category} • {describeEveryday(recipe.everydayScore)} • {describeHealth(recipe.healthScore)}
      </div>
    </button>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-center">Ukesplan</h1>

      <div className="space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {timelineItems.map((item) => {
            const isActive = item.weekStart === activeWeekStart;
            return (
              <button
                key={item.weekStart}
                type="button"
                onClick={() => {
                  setWeek(makeEmptyWeek());
                  setLongGap([]);
                  setFrequent([]);
                  setSearchResults([]);
                  setSearchError(null);
                  setActiveWeekStart(startOfWeekISO(item.weekStart));
                }}
                className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm ${
                  isActive
                    ? "bg-slate-900 text-white border-slate-900"
                    : item.hasEntries
                    ? "border-slate-400 text-slate-700"
                    : "border-dashed border-slate-300 text-slate-500"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-center text-gray-500">{statusText}</p>
      </div>

      <div className="overflow-x-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 min-w-[840px]">
          {week.map((recipe, index) => renderWeekCard(recipe, index))}
        </div>
      </div>

      <div className="space-y-4">
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Lenge siden sist</h2>
            <Button type="button" variant="outline" onClick={() => refreshSuggestions("longGap")}>
              Oppdater
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {longGap.length ? longGap.map((recipe, index) => renderSuggestionCard(recipe, "longGap", index)) : (
              <p className="text-sm text-gray-500">Ingen forslag akkurat nå</p>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Ofte brukt</h2>
            <Button type="button" variant="outline" onClick={() => refreshSuggestions("frequent")}>
              Oppdater
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {frequent.length ? frequent.map((recipe, index) => renderSuggestionCard(recipe, "frequent", index)) : (
              <p className="text-sm text-gray-500">Ingen forslag akkurat nå</p>
            )}
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
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    executeSearch();
                  }
                }}
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
            {searchResults.length ? (
              searchResults.map((recipe, index) => renderSuggestionCard(recipe, "search", index))
            ) : (
              !searchError && <p className="text-sm text-gray-500">Søk for å hente forslag</p>
            )}
          </div>
        </section>
      </div>

      {(weekPlanQuery.error || saveWeek.error || generateWeek.error) && (
        <p className="text-center text-sm text-red-500">Noe gikk galt. Prøv igjen.</p>
      )}
    </div>
  );
}
