"use client";
export const dynamic = "force-dynamic";

import type { ComponentProps, DragEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { trpc } from "../../lib/trpcClient";
import { Button, Card, CardContent, Input } from "@repo/ui";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";

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

  if (diffWeeks === 0) return "Denne uken";
  if (diffWeeks === 1) return "Neste uke";
  if (diffWeeks === -1) return "Forrige uke";

  return formatWeekRange(weekStartISO);
}

function makeEmptyWeek() {
  return Array.from({ length: 7 }, () => null) as WeekState;
}

function lowerIdSet(items: RecipeDTO[]) {
  return new Set(items.map((item) => item.id));
}

export default function PlannerPage() {
  const utils = trpc.useUtils();
  const currentWeekStart = useMemo(() => startOfWeekISO(), []);
  const [activeWeekStart, setActiveWeekStart] = useState(currentWeekStart);
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
  const [isMobileEditorOpen, setIsMobileEditorOpen] = useState(false);
  const [mobileEditorView, setMobileEditorView] = useState<"frequent" | "longGap" | "search">(
    "frequent"
  );

  const weekPlanQuery = trpc.planner.getWeekPlan.useQuery(
    { weekStart: activeWeekStart },
    { enabled: Boolean(activeWeekStart) }
  );
  const timelineQuery = trpc.planner.weekTimeline.useQuery({ around: currentWeekStart });

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
    const data = weekPlanQuery.data;
    if (!data) return;
    if (data.weekStart !== activeWeekStart) return;
    const hasRecipes = data.days.some((day) => Boolean(day.recipe));
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
    generateWeek,
    activeWeekStart,
    applyWeekData,
    timelineQuery,
    isAutoGenerating,
  ]);

  const commitWeekPlan = useCallback(
    async (nextWeek: WeekState, opts?: { suppressRefetch?: boolean }) => {
      setWeek(nextWeek);
      const ids = nextWeek.map((recipe) => recipe?.id ?? null);

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
        excludeIds: [],
        limit: 12,
      })) as RecipeDTO[];
      setSearchResults(data);
      setSearchError(data.length ? null : "Ingen treff");
    } catch (err) {
      setSearchError("Kunne ikke søke akkurat nå");
    } finally {
      setSearchLoading(false);
    }
  }, [searchTerm, utils]);

  useEffect(() => {
    const term = searchTerm.trim();
    if (!term) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    const handle = window.setTimeout(() => {
      executeSearch();
    }, 300);

    return () => window.clearTimeout(handle);
  }, [searchTerm, executeSearch]);

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
      }

    },
    [week, commitWeekPlan, longGap, frequent, searchResults]
  );

  const handleDragStart = useCallback((event: DragEvent, data: DragPayload) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/json", JSON.stringify(data));
    event.dataTransfer.setData("text/plain", data.recipeId);
  }, []);

  const timelineWeeks = useMemo(() => {
    if (!timelineQuery.data) return [] as Array<{ weekStart: string; hasEntries: boolean; label: string }>;

    const map = new Map<string, { hasEntries: boolean }>();
    timelineQuery.data.weeks.forEach((weekInfo) => {
      map.set(weekInfo.weekStart, {
        hasEntries: weekInfo.hasEntries,
      });
    });

    const items: Array<{ weekStart: string; hasEntries: boolean; label: string }> = [];
    for (let offset = -4; offset <= 4; offset += 1) {
      const weekIso = addWeeksISO(currentWeekStart, offset);
      const info = map.get(weekIso);
      items.push({
        weekStart: weekIso,
        hasEntries: info?.hasEntries ?? false,
        label: deriveWeekLabel(weekIso, currentWeekStart),
      });
    }

    return items;
  }, [timelineQuery.data, currentWeekStart]);

  const VISIBLE_WEEK_COUNT = 5;
  const [visibleStart, setVisibleStart] = useState(0);

  const activeWeekIndex = useMemo(
    () => timelineWeeks.findIndex((week) => week.weekStart === activeWeekStart),
    [timelineWeeks, activeWeekStart]
  );

  useEffect(() => {
    if (!timelineWeeks.length) return;
    if (activeWeekIndex === -1) return;
    const maxStart = Math.max(0, timelineWeeks.length - VISIBLE_WEEK_COUNT);
    const target = Math.max(
      0,
      Math.min(activeWeekIndex - Math.floor(VISIBLE_WEEK_COUNT / 2), maxStart)
    );
    setVisibleStart(target);
  }, [timelineWeeks, activeWeekIndex]);

  const canShowPrev = visibleStart > 0;
  const maxVisibleStart = Math.max(0, timelineWeeks.length - VISIBLE_WEEK_COUNT);
  const canShowNext = visibleStart < maxVisibleStart;
  const visibleWeeks = timelineWeeks.slice(visibleStart, visibleStart + VISIBLE_WEEK_COUNT);

  const mobileVisibleWeeks = useMemo(() => {
    if (!timelineWeeks.length) return [] as typeof timelineWeeks;
    if (activeWeekIndex === -1) return timelineWeeks.slice(0, Math.min(3, timelineWeeks.length));

    const result: typeof timelineWeeks = [];
    const prev = timelineWeeks[activeWeekIndex - 1];
    const current = timelineWeeks[activeWeekIndex];
    const next = timelineWeeks[activeWeekIndex + 1];

    if (prev) result.push(prev);
    if (current) result.push(current);
    if (next) result.push(next);

    return result;
  }, [timelineWeeks, activeWeekIndex]);

  const hasPrevTimelineWeek = activeWeekIndex > 0;
  const hasNextTimelineWeek =
    activeWeekIndex !== -1 && activeWeekIndex < timelineWeeks.length - 1;

  useEffect(() => {
    if (!timelineQuery.data) return;
    const { currentWeekStart: apiCurrentWeek, weeks } = timelineQuery.data;
    if (!weeks.some((week) => week.weekStart === activeWeekStart) && apiCurrentWeek) {
      setActiveWeekStart(apiCurrentWeek);
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

  const handleSelectWeek = (weekStart: string) => {
    const normalized = startOfWeekISO(weekStart);
    setWeek(makeEmptyWeek());
    setLongGap([]);
    setFrequent([]);
    setSearchResults([]);
    setSearchError(null);
    setActiveWeekStart(normalized);
  };

  const renderWeekSelectorButton = (item: {
    weekStart: string;
    hasEntries: boolean;
    label: string;
  }) => {
    const isActive = item.weekStart === activeWeekStart;
    const isCurrent = item.weekStart === currentWeekStart;

    const variant: ComponentProps<typeof Button>["variant"] =
      isActive ? "default" : isCurrent ? "outline" : item.hasEntries ? "secondary" : "ghost";

    return (
      <Button
        key={item.weekStart}
        type="button"
        variant={variant}
        size="sm"
        className="px-3"
        onClick={() => handleSelectWeek(item.weekStart)}
      >
        {item.label}
      </Button>
    );
  };

  const renderWeekCard = (recipe: WeekRecipe, index: number) => {
    const isDraggingTarget = dragOverIndex === index;
    return (
      <Card
        key={index}
        className={`${isDraggingTarget ? "ring-2 ring-ring " : ""}flex h-full w-full max-w-sm xl:max-w-full items-center justify-center text-center`}
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
        <CardContent className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
          <div className="text-xs text-muted-foreground">{DAY_NAMES[index]}</div>
          {recipe ? (
            <div className="space-y-1">
              <div className="font-medium line-clamp-2 break-words">{recipe.name}</div>
              {recipe.category ? (
                <div className="text-xs text-muted-foreground">{recipe.category}</div>
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground/60">Ingen valgt</div>
          )}
        </CardContent>
      </Card>
    );
  };

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const renderSuggestionCard = (recipe: RecipeDTO, source: DragSource, index: number) => {
    const isInWeek = selectedIdSet.has(recipe.id);
    const handlePick = async () => {
      if (isInWeek) return;
      const firstEmpty = week.findIndex((slot) => !slot);
      const targetIndex = firstEmpty === -1 ? 0 : firstEmpty;
      const next = [...week];
      next[targetIndex] = recipe;
      await commitWeekPlan(next);
      if (source === "longGap") setLongGap((prev) => prev.filter((item) => item.id !== recipe.id));
      if (source === "frequent") setFrequent((prev) => prev.filter((item) => item.id !== recipe.id));
    };

    return (
      <Card
        key={recipe.id}
        className={`${isInWeek ? "cursor-not-allowed opacity-90" : "cursor-grab"} relative flex h-full w-full max-w-sm xl:max-w-full items-center justify-center text-center`}
        onClick={handlePick}
        draggable={!isInWeek}
        onDragStart={(event) => {
          if (isInWeek) return;
          handleDragStart(event, { source, index, recipeId: recipe.id });
        }}
      >
        <CardContent className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
          <div className="font-medium line-clamp-2 break-words">{recipe.name}</div>
          {recipe.category ? (
            <div className="text-xs text-muted-foreground">{recipe.category}</div>
          ) : null}
        </CardContent>

        {isInWeek && (
          <div className="pointer-events-none absolute inset-0 rounded-lg bg-background/70 backdrop-blur-xs flex items-center justify-center px-3 text-center">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Allerede i ukeplanen
            </span>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-center">Ukesplan</h1>

      <div className="space-y-3">
        <div className="hidden sm:flex items-center justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8 p-0"
            onClick={() => setVisibleStart((prev) => Math.max(0, prev - 1))}
            disabled={!canShowPrev}
          >
            ←
          </Button>

          <div className="flex gap-2">
            {visibleWeeks.map((item) => renderWeekSelectorButton(item))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8 p-0"
            onClick={() => setVisibleStart((prev) => Math.min(maxVisibleStart, prev + 1))}
            disabled={!canShowNext}
          >
            →
          </Button>
        </div>

        <div className="sm:hidden flex items-center justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8 p-0"
            onClick={() => {
              if (!hasPrevTimelineWeek) return;
              const prevWeek = timelineWeeks[activeWeekIndex - 1];
              if (prevWeek) handleSelectWeek(prevWeek.weekStart);
            }}
            disabled={!hasPrevTimelineWeek}
          >
            ←
          </Button>

          <div className="flex gap-2">
            {mobileVisibleWeeks.map((item) => renderWeekSelectorButton(item))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8 p-0"
            onClick={() => {
              if (!hasNextTimelineWeek) return;
              const nextWeek = timelineWeeks[activeWeekIndex + 1];
              if (nextWeek) handleSelectWeek(nextWeek.weekStart);
            }}
            disabled={!hasNextTimelineWeek}
          >
            →
          </Button>
        </div>

        <p className="text-xs text-center text-muted-foreground">{statusText}</p>
      </div>

      <div className="space-y-4 sm:hidden">
        {isMobileEditorOpen ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                {week.map((recipe, index) => renderWeekCard(recipe, index))}
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="mobile-editor-source" className="text-sm font-medium">
                    Velg forslag
                  </label>
                  {mobileEditorView !== "search" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (mobileEditorView === "longGap" || mobileEditorView === "frequent") {
                          refreshSuggestions(mobileEditorView);
                        }
                      }}
                    >
                      Oppdater
                    </Button>
                  ) : null}
                </div>

                <select
                  id="mobile-editor-source"
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={mobileEditorView}
                  onChange={(event) =>
                    setMobileEditorView(event.target.value as "frequent" | "longGap" | "search")
                  }
                >
                  <option value="frequent">Ofte brukt</option>
                  <option value="longGap">Lenge siden sist</option>
                  <option value="search">Søk</option>
                </select>

                {mobileEditorView === "search" ? (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Input
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
                      <div className="flex gap-2">
                        <Button type="button" onClick={executeSearch} disabled={searchLoading} className="flex-1">
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
                          className="flex-1"
                        >
                          Tøm
                        </Button>
                      </div>
                    </div>
                    {searchError && <p className="text-sm text-red-500">{searchError}</p>}
                    <div className="flex flex-col gap-2">
                      {searchResults.length ? (
                        searchResults.map((recipe, index) => renderSuggestionCard(recipe, "search", index))
                      ) : (
                        !searchError && <p className="text-sm text-gray-500">Søk for å hente forslag</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {(mobileEditorView === "longGap" ? longGap : frequent).length ? (
                      (mobileEditorView === "longGap" ? longGap : frequent).map((recipe, index) =>
                        renderSuggestionCard(recipe, mobileEditorView, index)
                      )
                    ) : (
                      <p className="text-sm text-gray-500">Ingen forslag akkurat nå</p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setIsMobileEditorOpen(false)}
            >
              Ferdig med endringer
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col gap-2">
              {week.map((recipe, index) => renderWeekCard(recipe, index))}
            </div>
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                setMobileEditorView("frequent");
                setIsMobileEditorOpen(true);
              }}
            >
              Trykk her for å endre ukesplanen
            </Button>
          </div>
        )}
      </div>

      <div className="hidden sm:block">
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 justify-items-center xl:min-w-[840px]">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 justify-items-center">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 justify-items-center">
                {frequent.length ? frequent.map((recipe, index) => renderSuggestionCard(recipe, "frequent", index)) : (
                  <p className="text-sm text-gray-500">Ingen forslag akkurat nå</p>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-end sm:gap-3">
                <div className="flex-1 flex flex-col">
                  <label className="text-sm">Søk i alle oppskrifter</label>
                  <Input
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 justify-items-center">
                {searchResults.length ? (
                  searchResults.map((recipe, index) => renderSuggestionCard(recipe, "search", index))
                ) : (
                  !searchError && <p className="text-sm text-gray-500">Søk for å hente forslag</p>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      {(weekPlanQuery.error || saveWeek.error || generateWeek.error) && (
        <p className="text-center text-sm text-red-500">Noe gikk galt. Prøv igjen.</p>
      )}
    </div>
  );
}
