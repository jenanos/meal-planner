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
const DESKTOP_WINDOW_SIZE = 5;
const MOBILE_WINDOW_SIZE = 3;

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

type TimelineWeek = {
  weekStart: string;
  hasEntries: boolean;
  label: string;
};

type TimelineWeekEntry = {
  week: TimelineWeek | null;
  index: number | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

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
  const [desktopWindowStart, setDesktopWindowStart] = useState(0);
  const [mobileWindowStart, setMobileWindowStart] = useState(0);

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

  const timelineWeeks = useMemo<TimelineWeek[]>(() => {
    if (!timelineQuery.data) return [];

    const map = new Map<string, { hasEntries: boolean }>();
    timelineQuery.data.weeks.forEach((weekInfo) => {
      map.set(weekInfo.weekStart, {
        hasEntries: weekInfo.hasEntries,
      });
    });

    const items: TimelineWeek[] = [];
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

  const activeWeekIndex = useMemo(
    () => timelineWeeks.findIndex((week) => week.weekStart === activeWeekStart),
    [timelineWeeks, activeWeekStart]
  );

  const desktopWindowSize = useMemo(() => {
    if (!timelineWeeks.length) return 0;
    return Math.min(DESKTOP_WINDOW_SIZE, timelineWeeks.length);
  }, [timelineWeeks.length]);

  const mobileWindowSize = useMemo(() => {
    if (!timelineWeeks.length) return 0;
    return Math.min(MOBILE_WINDOW_SIZE, timelineWeeks.length);
  }, [timelineWeeks.length]);

  const desktopMaxStart = useMemo(() => {
    if (!desktopWindowSize) return 0;
    return Math.max(0, timelineWeeks.length - desktopWindowSize);
  }, [timelineWeeks.length, desktopWindowSize]);

  const mobileMaxStart = useMemo(() => {
    if (!mobileWindowSize) return 0;
    return Math.max(0, timelineWeeks.length - mobileWindowSize);
  }, [timelineWeeks.length, mobileWindowSize]);

  useEffect(() => {
    if (!timelineWeeks.length) {
      setDesktopWindowStart(0);
      setMobileWindowStart(0);
      return;
    }

    setDesktopWindowStart((prev) => clamp(prev, 0, desktopMaxStart));
    setMobileWindowStart((prev) => clamp(prev, 0, mobileMaxStart));
  }, [timelineWeeks.length, desktopMaxStart, mobileMaxStart]);

  const makeWindowEntries = useCallback(
    (start: number, size: number): TimelineWeekEntry[] => {
      if (!size) return [];
      const entries: TimelineWeekEntry[] = [];
      for (let i = 0; i < size; i += 1) {
        const index = start + i;
        const week = timelineWeeks[index] ?? null;
        entries.push({ week, index: week ? index : null });
      }
      return entries;
    },
    [timelineWeeks]
  );

  const desktopVisibleWeeks = useMemo(
    () => makeWindowEntries(desktopWindowStart, desktopWindowSize),
    [makeWindowEntries, desktopWindowStart, desktopWindowSize]
  );

  const mobileVisibleWeeks = useMemo(
    () => makeWindowEntries(mobileWindowStart, mobileWindowSize),
    [makeWindowEntries, mobileWindowStart, mobileWindowSize]
  );

  const centerWindowsAround = useCallback(
    (targetIndex: number) => {
      if (desktopWindowSize) {
        const centeredDesktop = clamp(
          targetIndex - Math.floor(desktopWindowSize / 2),
          0,
          desktopMaxStart
        );
        setDesktopWindowStart(centeredDesktop);
      }
      if (mobileWindowSize) {
        const centeredMobile = clamp(
          targetIndex - Math.floor(mobileWindowSize / 2),
          0,
          mobileMaxStart
        );
        setMobileWindowStart(centeredMobile);
      }
    },
    [desktopWindowSize, mobileWindowSize, desktopMaxStart, mobileMaxStart]
  );

  const canDesktopPagePrev = desktopWindowStart > 0;
  const canDesktopPageNext = desktopWindowStart < desktopMaxStart;
  const canMobilePagePrev = mobileWindowStart > 0;
  const canMobilePageNext = mobileWindowStart < mobileMaxStart;

  const pageDesktop = useCallback(
    (delta: number) => {
      if (!desktopWindowSize) return;
      setDesktopWindowStart((prev) => {
        const maxStart = Math.max(0, timelineWeeks.length - desktopWindowSize);
        return clamp(prev + delta, 0, maxStart);
      });
    },
    [timelineWeeks.length, desktopWindowSize]
  );

  const pageMobile = useCallback(
    (delta: number) => {
      if (!mobileWindowSize) return;
      setMobileWindowStart((prev) => {
        const maxStart = Math.max(0, timelineWeeks.length - mobileWindowSize);
        return clamp(prev + delta, 0, maxStart);
      });
    },
    [timelineWeeks.length, mobileWindowSize]
  );

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

  const handleSelectWeek = (weekStart: string, indexHint?: number | null) => {
    const normalized = startOfWeekISO(weekStart);
    setWeek(makeEmptyWeek());
    setLongGap([]);
    setFrequent([]);
    setSearchResults([]);
    setSearchError(null);
    setActiveWeekStart(normalized);
    const targetIndex =
      typeof indexHint === "number" ? indexHint : timelineWeeks.findIndex((week) => week.weekStart === normalized);
    if (targetIndex !== -1) {
      centerWindowsAround(targetIndex);
    }
  };

  const renderWeekSelectorRow = (
    weeks: TimelineWeekEntry[],
    options: {
      variant: "desktop" | "mobile";
      onPrev: () => void;
      onNext: () => void;
      disablePrev: boolean;
      disableNext: boolean;
    }
  ) => {
    if (!weeks.length) return null;

    const baseWidth = options.variant === "mobile" ? "min-w-[96px]" : "min-w-[120px]";
    const gap = options.variant === "mobile" ? "gap-2" : "gap-3";
    const paddingX = options.variant === "mobile" ? "px-12" : "px-16";
    const gradientWidth = options.variant === "mobile" ? "w-12" : "w-20";

    return (
      <div className="relative flex min-h-[44px] items-center justify-center">
        <div
          className={`pointer-events-none absolute inset-y-0 left-0 ${gradientWidth} bg-gradient-to-r from-background via-background/80 to-transparent z-10`}
        />
        <div
          className={`pointer-events-none absolute inset-y-0 right-0 ${gradientWidth} bg-gradient-to-l from-background via-background/80 to-transparent z-10`}
        />

        <div className={`relative z-0 flex ${gap} overflow-hidden ${paddingX} py-1`}>
          {weeks.map((entry, index) => {
            if (!entry.week) {
              return (
                <span
                  key={`placeholder-${options.variant}-${index}`}
                  className={`inline-block ${baseWidth} h-9 rounded-md opacity-0 pointer-events-none`}
                  aria-hidden
                />
              );
            }

            const isActive = entry.week.weekStart === activeWeekStart;
            const isCurrent = entry.week.weekStart === currentWeekStart;

            let opacityClass = "opacity-65";
            if (entry.index !== null && activeWeekIndex !== -1) {
              const distance = Math.abs(entry.index - activeWeekIndex);
              if (distance === 0) opacityClass = "opacity-100";
              else if (distance === 1) opacityClass = "opacity-70";
              else if (distance >= 2) opacityClass = "opacity-45";
            } else if (index === 0 || index === weeks.length - 1) {
              opacityClass = "opacity-45";
            }

            const variant: ComponentProps<typeof Button>["variant"] = "ghost";

            return (
              <Button
                key={entry.week.weekStart}
                type="button"
                variant={variant}
                size="sm"
                className={`${baseWidth} px-3 text-sm transition-opacity whitespace-nowrap ${
                  isActive ? "font-semibold opacity-100 bg-primary/10" : opacityClass
                }`}
                onClick={() => handleSelectWeek(entry.week.weekStart, entry.index)}
              >
                {entry.week.label}
              </Button>
            );
          })}
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          className={`absolute left-2 top-1/2 -translate-y-1/2 shadow-sm z-20 ${
            options.variant === "mobile" ? "size-8" : "size-9"
          } bg-background`}
          aria-label="Forrige uke"
          onClick={options.onPrev}
          disabled={options.disablePrev}
        >
          ←
        </Button>

        <Button
          type="button"
          variant="outline"
          size="icon"
          className={`absolute right-2 top-1/2 -translate-y-1/2 shadow-sm z-20 ${
            options.variant === "mobile" ? "size-8" : "size-9"
          } bg-background`}
          aria-label="Neste uke"
          onClick={options.onNext}
          disabled={options.disableNext}
        >
          →
        </Button>
      </div>
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
        <div className="hidden sm:block">
          {renderWeekSelectorRow(desktopVisibleWeeks, {
            variant: "desktop",
            onPrev: () => pageDesktop(-1),
            onNext: () => pageDesktop(1),
            disablePrev: !canDesktopPagePrev,
            disableNext: !canDesktopPageNext,
          })}
        </div>

        <div className="sm:hidden">
          {renderWeekSelectorRow(mobileVisibleWeeks, {
            variant: "mobile",
            onPrev: () => pageMobile(-1),
            onNext: () => pageMobile(1),
            disablePrev: !canMobilePagePrev,
            disableNext: !canMobilePageNext,
          })}
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
