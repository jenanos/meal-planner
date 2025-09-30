"use client";
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { trpc } from "../../lib/trpcClient";
import { WeekSelector } from "./components/WeekSelector";
import { WeekSlot } from "./components/WeekSlot";
import { SuggestionSection } from "./components/SuggestionSection";
import { SearchSection } from "./components/SearchSection";
import { MobileEditor } from "./components/MobileEditor";
import { DragOverlayCard } from "./components/DragOverlayCard";
import { startOfWeekISO, addWeeksISO, deriveWeekLabel } from "../../lib/week";

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import { createPortal } from "react-dom";

import type { DragPayload, RecipeDTO, TimelineWeek, TimelineWeekEntry, WeekPlanResult, WeekState } from "./types";
import { clamp, lowerIdSet, makeEmptyWeek, parseDragId } from "./utils";

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

    if (typeof window === "undefined") {
      return;
    }

    const handle = window.setTimeout(() => {
      executeSearch();
    }, 300);

    return () => window.clearTimeout(handle);
  }, [searchTerm, executeSearch]);

  const clearSearch = useCallback(() => {
    setSearchTerm("");
    setSearchResults([]);
    setSearchError(null);
  }, []);

  const addRecipeToFirstAvailableSlot = useCallback(
    async (recipe: RecipeDTO) => {
      const firstEmpty = week.findIndex((slot) => !slot);
      const targetIndex = firstEmpty === -1 ? 0 : firstEmpty;
      const next = [...week];
      next[targetIndex] = recipe;
      await commitWeekPlan(next);
    },
    [week, commitWeekPlan]
  );

  const handlePickFromSource = useCallback(
    async (source: "longGap" | "frequent" | "search", recipe: RecipeDTO) => {
      await addRecipeToFirstAvailableSlot(recipe);
      if (source === "longGap") {
        setLongGap((prev) => prev.filter((item) => item.id !== recipe.id));
      } else if (source === "frequent") {
        setFrequent((prev) => prev.filter((item) => item.id !== recipe.id));
      }
    },
    [addRecipeToFirstAvailableSlot]
  );

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
      const lists: Record<Exclude<DragPayload["source"], "week">, RecipeDTO[]> = {
        longGap,
        frequent,
        search: searchResults,
      };
      const list = lists[payload.source as Exclude<DragPayload["source"], "week">];
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

  const overlayPayload = useMemo(() => (activeId ? parseDragId(activeId) : null), [activeId]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const portalTarget = typeof document === "undefined" ? null : document.body;

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
          <MobileEditor
            week={week}
            dayNames={DAY_NAMES}
            selectedIdSet={selectedIdSet}
            longGap={longGap}
            frequent={frequent}
            searchTerm={searchTerm}
            searchResults={searchResults}
            searchLoading={searchLoading}
            searchError={searchError}
            mobileEditorView={mobileEditorView}
            isMobileEditorOpen={isMobileEditorOpen}
            onToggleEditor={setIsMobileEditorOpen}
            onChangeView={setMobileEditorView}
            onRefreshSuggestion={refreshSuggestions}
            onSearchTermChange={setSearchTerm}
            onSearch={executeSearch}
            onClearSearch={clearSearch}
            onPickFromSource={handlePickFromSource}
          />
        </div>

        <div className="hidden sm:block">
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 justify-items-center xl:min-w-[840px]">
                {week.map((recipe, index) => (
                  <WeekSlot key={index} index={index} dayName={DAY_NAMES[index]} recipe={recipe} />
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <SuggestionSection
                title="Lenge siden sist"
                recipes={longGap}
                source="longGap"
                selectedIdSet={selectedIdSet}
                onRefresh={() => refreshSuggestions("longGap")}
                onPick={(recipe) => handlePickFromSource("longGap", recipe)}
              />

              <SuggestionSection
                title="Ofte brukt"
                recipes={frequent}
                source="frequent"
                selectedIdSet={selectedIdSet}
                onRefresh={() => refreshSuggestions("frequent")}
                onPick={(recipe) => handlePickFromSource("frequent", recipe)}
              />

              <SearchSection
                title="Søk i alle oppskrifter"
                searchTerm={searchTerm}
                onSearchTermChange={setSearchTerm}
                searchLoading={searchLoading}
                searchError={searchError}
                searchResults={searchResults}
                selectedIdSet={selectedIdSet}
                onSearch={executeSearch}
                onClear={clearSearch}
                onPick={(recipe) => handlePickFromSource("search", recipe)}
              />
            </div>
          </div>
        </div>

        {(weekPlanQuery.error || saveWeek.error || generateWeek.error) && (
          <p className="text-center text-sm text-red-500">Noe gikk galt. Prøv igjen.</p>
        )}
      </div>

      {/* DragOverlay i portal */}
      {mounted && portalTarget &&
        createPortal(
          <DragOverlay dropAnimation={null} style={{ pointerEvents: "none", zIndex: 1000 }}>
            <DragOverlayCard
              payload={overlayPayload}
              overIndex={overIndex}
              dayNames={DAY_NAMES}
              week={week}
              longGap={longGap}
              frequent={frequent}
              searchResults={searchResults}
            />
          </DragOverlay>,
          portalTarget
        )}
    </DndContext>
  );
}
