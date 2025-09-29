"use client";
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { trpc } from "../../lib/trpcClient";
import { Button, Input } from "@repo/ui";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";
import { WeekSelector } from "./components/WeekSelector";
import { WeekCard } from "./components/WeekCard";
import { SuggestionCard } from "./components/SuggestionCard";
import {
  MS_PER_DAY,
  startOfWeekISO,
  addWeeksISO,
  addDays,
  deriveWeekLabel,
  formatWeekRange,
} from "../../lib/week";

// Add dnd-kit imports
import {
  DndContext,
  useDraggable,
  useDroppable,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import { createPortal } from "react-dom";

const DAY_NAMES = [
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
  "Søndag",
] as const;

const DESKTOP_WINDOW_SIZE = 5;
const MOBILE_WINDOW_SIZE = 3;

type PlannerOutputs = inferRouterOutputs<AppRouter>["planner"];
type WeekPlanResult = PlannerOutputs["getWeekPlan"];
type WeekDay = WeekPlanResult["days"][number];
type WeekRecipe = WeekDay["recipe"];
type RecipeDTO = NonNullable<WeekRecipe>;
type WeekState = (RecipeDTO | null)[];

// ADD: timeline-typer som brukes i denne filen
type TimelineWeek = {
  weekStart: string;
  hasEntries: boolean;
  label: string;
};

type TimelineWeekEntry = {
  week: TimelineWeek | null;
  index: number | null;
};

// ADD: enkle util-funksjoner som mangler i filen
function makeEmptyWeek(): WeekState {
  return Array<RecipeDTO | null>(7).fill(null);
}

function lowerIdSet(list: RecipeDTO[]): Set<string> {
  return new Set(list.map((r) => r.id));
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type DragSource = "week" | "longGap" | "frequent" | "search";

type DragPayload = {
  source: DragSource;
  index: number;
  recipeId: string;
};

// Small helper to encode/decode drag ids
function makeDragId(p: DragPayload) {
  return `${p.source}:${p.index}:${p.recipeId}`;
}
function parseDragId(id: string): DragPayload | null {
  const [source, indexStr, recipeId] = id.split(":");
  if (
    (source === "week" || source === "longGap" || source === "frequent" || source === "search") &&
    Number.isFinite(Number(indexStr)) &&
    recipeId
  ) {
    return { source, index: Number(indexStr), recipeId };
  }
  return null;
}

// Droppable wrapper for each week slot
function WeekDroppableSlot(props: {
  index: number;
  children: (isOver: boolean, setNodeRef: (node: HTMLElement | null) => void) => React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `day-${props.index}` });
  return <>{props.children(isOver, setNodeRef)}</>;
}

// Generic draggable wrapper
function DraggableWrapper(props: {
  id: string;
  children: (opts: {
    setNodeRef: any;
    listeners: any;
    attributes: any;
    style: any;
  }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: props.id });

  // Når vi bruker DragOverlay: ikke flytt originalen, og skjul den mens den dras
  const style = isDragging
    ? {
      opacity: 0,              // skjul kilden
      touchAction: "none",
      cursor: "grabbing",
    }
    : transform
      ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        touchAction: "none",
        cursor: "grabbing",
        zIndex: 50,
      }
      : { touchAction: "none", cursor: "grab" };

  return <>{props.children({ setNodeRef, listeners, attributes, style })}</>;
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
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [lastUpdatedISO, setLastUpdatedISO] = useState<string | null>(null);
  const [isMobileEditorOpen, setIsMobileEditorOpen] = useState(false);
  const [mobileEditorView, setMobileEditorView] = useState<"frequent" | "longGap" | "search">(
    "frequent"
  );
  const [desktopWindowStart, setDesktopWindowStart] = useState(0);
  const [mobileWindowStart, setMobileWindowStart] = useState(0);

  // dnd-kit: sensors + active id
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null); // NY: hvilken dag vi er over

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
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

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

  // dnd-kit handlers
  const onDragStart = useCallback((event: any) => {
    setActiveId(String(event.active.id));
    setOverIndex(null);
  }, []);

  const onDragOver = useCallback((event: any) => {
    const overId: string | null = event.over ? String(event.over.id) : null;
    if (overId && overId.startsWith("day-")) {
      const idx = Number(overId.slice(4));
      setOverIndex(Number.isFinite(idx) ? idx : null);
    } else {
      setOverIndex(null);
    }
  }, []);

  const onDragCancel = useCallback(() => {
    setActiveId(null);
    setOverIndex(null);
  }, []);

  const onDragEnd = useCallback(async (event: any) => {
    const { active, over } = event;
    setActiveId(null);
    setOverIndex(null);
    if (!over) return;

    const overId = String(over.id);
    if (!overId.startsWith("day-")) return;

    const targetIndex = Number(overId.slice(4));
    if (!Number.isFinite(targetIndex)) return;

    const payload = parseDragId(String(active.id));
    if (!payload) return;

    // Helper to resolve the dragged recipe
    const getRecipe = (): RecipeDTO | null => {
      if (payload.source === "week") {
        return week[payload.index] ?? null;
      }
      const lists: Record<Exclude<DragSource, "week">, RecipeDTO[]> = {
        longGap,
        frequent,
        search: searchResults,
      };
      const list = lists[payload.source as Exclude<DragSource, "week">];
      return list[payload.index] ?? list.find((r) => r.id === payload.recipeId) ?? null;
    };

    const recipe = getRecipe();
    if (!recipe) return;

    if (payload.source === "week") {
      if (payload.index === targetIndex) return;
      const next = [...week];
      const [moved] = next.splice(payload.index, 1);
      next.splice(targetIndex, 0, moved);
      await commitWeekPlan(next);
      return;
    }

    // From suggestions -> into week
    {
      const next = [...week];
      next[targetIndex] = recipe;
      await commitWeekPlan(next);

      if (payload.source === "longGap") {
        setLongGap((prev) => prev.filter((x) => x.id !== recipe.id));
      } else if (payload.source === "frequent") {
        setFrequent((prev) => prev.filter((x) => x.id !== recipe.id));
      }
    }
  }, [week, longGap, frequent, searchResults, commitWeekPlan]);

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

  // Hent innholdet som skal vises i DragOverlay basert på activeId
  const overlayContent = useMemo(() => {
    if (!activeId) return null;
    const payload = parseDragId(activeId);
    if (!payload) return null;

    // Finn oppskriften basert på kilden
    const getRecipe = (): RecipeDTO | null => {
      if (payload.source === "week") return week[payload.index] ?? null;
      const lists: Record<Exclude<DragSource, "week">, RecipeDTO[]> = {
        longGap,
        frequent,
        search: searchResults,
      };
      const list = lists[payload.source as Exclude<DragSource, "week">];
      return list[payload.index] ?? list.find((r) => r.id === payload.recipeId) ?? null;
    };
    const recipe = getRecipe();
    if (!recipe) return null;

    const isAdd = payload.source !== "week";
    const targetLabel = overIndex != null ? DAY_NAMES[overIndex] : "Slipp på en dag";

    // Kreativ “ghost”-overlay: lett forstørret, rotert, med chip for mål-dag
    return (
      <div className="pointer-events-none select-none rounded-xl border bg-background/95 shadow-2xl ring-2 ring-primary/40 transform-gpu scale-105 rotate-2 px-4 py-3 min-w-[200px] max-w-[260px]">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
          {isAdd ? "Legg til" : "Flytter"}
        </div>
        <div className="font-medium leading-snug line-clamp-2">{recipe.name}</div>
        {recipe.category ? (
          <div className="text-xs text-muted-foreground">{recipe.category}</div>
        ) : null}
        <div className="mt-2 inline-block rounded-full bg-primary/10 text-primary px-2 py-1 text-[11px]">
          {targetLabel}
        </div>
      </div>
    );
  }, [activeId, week, longGap, frequent, searchResults, overIndex]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragOver={onDragOver}    // NY: oppdaterer overIndex fortløpende
      onDragCancel={onDragCancel}
      onDragEnd={onDragEnd}
    >
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-center">Ukesplan</h1>

        <div className="space-y-3">
          <div className="hidden sm:block">
            <WeekSelector
              weeks={desktopVisibleWeeks}
              variant="desktop"
              onPrev={() => pageDesktop(-1)}
              onNext={() => pageDesktop(1)}
              disablePrev={!canDesktopPagePrev}
              disableNext={!canDesktopPageNext}
              activeWeekStart={activeWeekStart}
              currentWeekStart={currentWeekStart}
              activeWeekIndex={activeWeekIndex}
              mobileWindowStart={mobileWindowStart}
              mobileMaxStart={mobileMaxStart}
              onSelectWeek={handleSelectWeek}
            />
          </div>

          <div className="sm:hidden">
            <WeekSelector
              weeks={mobileVisibleWeeks}
              variant="mobile"
              onPrev={() => pageMobile(-1)}
              onNext={() => pageMobile(1)}
              disablePrev={!canMobilePagePrev}
              disableNext={!canMobilePageNext}
              activeWeekStart={activeWeekStart}
              currentWeekStart={currentWeekStart}
              activeWeekIndex={activeWeekIndex}
              mobileWindowStart={mobileWindowStart}
              mobileMaxStart={mobileMaxStart}
              onSelectWeek={handleSelectWeek}
            />
          </div>

          <p className="text-xs text-center text-muted-foreground">{statusText}</p>
        </div>

        <div className="space-y-4 sm:hidden">
          {isMobileEditorOpen ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  {week.map((recipe, index) => (
                    <WeekDroppableSlot key={index} index={index}>
                      {(isOver, setDropRef) => (
                        <div ref={setDropRef}>
                          {recipe ? (
                            <DraggableWrapper id={makeDragId({ source: "week", index, recipeId: recipe.id })}>
                              {({ setNodeRef, listeners, attributes, style }) => (
                                <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
                                  <WeekCard
                                    index={index}
                                    dayName={DAY_NAMES[index]}
                                    recipe={recipe}
                                    isDraggingTarget={isOver}
                                  />
                                </div>
                              )}
                            </DraggableWrapper>
                          ) : (
                            <WeekCard
                              index={index}
                              dayName={DAY_NAMES[index]}
                              recipe={recipe}
                              isDraggingTarget={isOver}
                            />
                          )}
                        </div>
                      )}
                    </WeekDroppableSlot>
                  ))}
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
                        {searchResults.length
                          ? searchResults.map((recipe, index) => (
                            <DraggableWrapper
                              key={recipe.id}
                              id={makeDragId({ source: "search", index, recipeId: recipe.id })}
                            >
                              {({ setNodeRef, listeners, attributes, style }) => (
                                <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
                                  <SuggestionCard
                                    recipe={recipe}
                                    source="search"
                                    index={index}
                                    isInWeek={selectedIdSet.has(recipe.id)}
                                    onPick={async () => {
                                      const firstEmpty = week.findIndex((slot) => !slot);
                                      const targetIndex = firstEmpty === -1 ? 0 : firstEmpty;
                                      const next = [...week];
                                      next[targetIndex] = recipe;
                                      await commitWeekPlan(next);
                                    }}
                                  />
                                </div>
                              )}
                            </DraggableWrapper>
                          ))
                          : !searchError && <p className="text-sm text-gray-500">Søk for å hente forslag</p>}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {(mobileEditorView === "longGap" ? longGap : frequent).length ? (
                        (mobileEditorView === "longGap" ? longGap : frequent).map((recipe, index) => {
                          const isInWeek = selectedIdSet.has(recipe.id);
                          const onPick = async () => {
                            if (isInWeek) return;
                            const firstEmpty = week.findIndex((slot) => !slot);
                            const targetIndex = firstEmpty === -1 ? 0 : firstEmpty;
                            const next = [...week];
                            next[targetIndex] = recipe;
                            await commitWeekPlan(next);
                            setLongGap((prev) => prev.filter((x) => x.id !== recipe.id));
                          };
                          return (
                            <DraggableWrapper
                              key={recipe.id}
                              id={makeDragId({
                                source: mobileEditorView,
                                index,
                                recipeId: recipe.id,
                              })}
                            >
                              {({ setNodeRef, listeners, attributes, style }) => (
                                <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
                                  <SuggestionCard
                                    recipe={recipe}
                                    source={mobileEditorView}
                                    index={index}
                                    isInWeek={isInWeek}
                                    onPick={onPick}
                                  />
                                </div>
                              )}
                            </DraggableWrapper>
                          );
                        })
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
                {week.map((recipe, index) => (
                  <WeekDroppableSlot key={index} index={index}>
                    {(isOver, setDropRef) => (
                      <div ref={setDropRef}>
                        {recipe ? (
                          <DraggableWrapper id={makeDragId({ source: "week", index, recipeId: recipe.id })}>
                            {({ setNodeRef, listeners, attributes, style }) => (
                              <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
                                <WeekCard
                                  index={index}
                                  dayName={DAY_NAMES[index]}
                                  recipe={recipe}
                                  isDraggingTarget={isOver}
                                />
                              </div>
                            )}
                          </DraggableWrapper>
                        ) : (
                          <WeekCard
                            index={index}
                            dayName={DAY_NAMES[index]}
                            recipe={recipe}
                            isDraggingTarget={isOver}
                          />
                        )}
                      </div>
                    )}
                  </WeekDroppableSlot>
                ))}
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
                {week.map((recipe, index) => (
                  <WeekDroppableSlot key={index} index={index}>
                    {(isOver, setDropRef) => (
                      <div ref={setDropRef}>
                        {recipe ? (
                          <DraggableWrapper id={makeDragId({ source: "week", index, recipeId: recipe.id })}>
                            {({ setNodeRef, listeners, attributes, style }) => (
                              <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
                                <WeekCard
                                  index={index}
                                  dayName={DAY_NAMES[index]}
                                  recipe={recipe}
                                  isDraggingTarget={isOver}
                                />
                              </div>
                            )}
                          </DraggableWrapper>
                        ) : (
                          <WeekCard
                            index={index}
                            dayName={DAY_NAMES[index]}
                            recipe={recipe}
                            isDraggingTarget={isOver}
                          />
                        )}
                      </div>
                    )}
                  </WeekDroppableSlot>
                ))}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2 justify-items-center">
                  {longGap.length ? longGap.map((recipe, index) => (
                    <DraggableWrapper key={recipe.id} id={makeDragId({ source: "longGap", index, recipeId: recipe.id })}>
                      {({ setNodeRef, listeners, attributes, style }) => (
                        <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
                          <SuggestionCard
                            recipe={recipe}
                            source="longGap"
                            index={index}
                            isInWeek={selectedIdSet.has(recipe.id)}
                            onPick={async () => {
                              const firstEmpty = week.findIndex((slot) => !slot);
                              const targetIndex = firstEmpty === -1 ? 0 : firstEmpty;
                              const next = [...week];
                              next[targetIndex] = recipe;
                              await commitWeekPlan(next);
                              setLongGap((prev) => prev.filter((x) => x.id !== recipe.id));
                            }}
                          />
                        </div>
                      )}
                    </DraggableWrapper>
                  )) : (
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2 justify-items-center">
                  {frequent.length ? frequent.map((recipe, index) => (
                    <DraggableWrapper key={recipe.id} id={makeDragId({ source: "frequent", index, recipeId: recipe.id })}>
                      {({ setNodeRef, listeners, attributes, style }) => (
                        <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
                          <SuggestionCard
                            recipe={recipe}
                            source="frequent"
                            index={index}
                            isInWeek={selectedIdSet.has(recipe.id)}
                            onPick={async () => {
                              const firstEmpty = week.findIndex((slot) => !slot);
                              const targetIndex = firstEmpty === -1 ? 0 : firstEmpty;
                              const next = [...week];
                              next[targetIndex] = recipe;
                              await commitWeekPlan(next);
                              setFrequent((prev) => prev.filter((x) => x.id !== recipe.id));
                            }}
                          />
                        </div>
                      )}
                    </DraggableWrapper>
                  )) : (
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2 justify-items-center">
                  {searchResults.length
                    ? searchResults.map((recipe, index) => (
                      <DraggableWrapper key={recipe.id} id={makeDragId({ source: "search", index, recipeId: recipe.id })}>
                        {({ setNodeRef, listeners, attributes, style }) => (
                          <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
                            <SuggestionCard
                              recipe={recipe}
                              source="search"
                              index={index}
                              isInWeek={selectedIdSet.has(recipe.id)}
                              onPick={async () => {
                                const firstEmpty = week.findIndex((slot) => !slot);
                                const targetIndex = firstEmpty === -1 ? 0 : firstEmpty;
                                const next = [...week];
                                next[targetIndex] = recipe;
                                await commitWeekPlan(next);
                              }}
                            />
                          </div>
                        )}
                      </DraggableWrapper>
                    ))
                    : !searchError && <p className="text-sm text-gray-500">Søk for å hente forslag</p>}
                </div>
              </section>
            </div>
          </div>
        </div>

        {(weekPlanQuery.error || saveWeek.error || generateWeek.error) && (
          <p className="text-center text-sm text-red-500">Noe gikk galt. Prøv igjen.</p>
        )}
      </div>

      {/* DragOverlay i portal */}
      {mounted &&
        createPortal(
          <DragOverlay dropAnimation={null} style={{ pointerEvents: "none", zIndex: 1000 }}>
            {overlayContent}
          </DragOverlay>,
          document.body
        )}
    </DndContext>
  );
}
