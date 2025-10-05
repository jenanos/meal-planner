"use client";
/* eslint-env browser */
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  rectIntersection,
  pointerWithin,
  MeasuringStrategy,
} from "@dnd-kit/core";
import { restrictToWindowEdges, snapCenterToCursor } from "@dnd-kit/modifiers";
import { createPortal } from "react-dom";

import type { DragPayload, RecipeDTO, TimelineWeek, WeekPlanResult, WeekState } from "./types";
import { lowerIdSet, makeEmptyWeek, parseDragId } from "./utils";

const DAY_NAMES = [
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
  "Søndag",
] as const;

// Scroll-based week selector: no fixed window sizes needed

function useIsTouchDevice() {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch(
      typeof window !== "undefined" &&
      // coarse pointer ~ touch
      (window.matchMedia?.("(pointer: coarse)")?.matches || (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0))
    );
  }, []);
  return isTouch;
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
  const [lastSavedIds, setLastSavedIds] = useState<Array<string | null> | null>(null);
  const [isMobileEditorOpen, setIsMobileEditorOpen] = useState(false);
  const [mobileEditorView, setMobileEditorView] = useState<"frequent" | "longGap" | "search">(
    "frequent"
  );
  // Removed window paging state; ScrollArea handles horizontal scrolling.

  // dnd-kit: sensors + active id
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    // On touch, require a short press to start dragging to allow normal scroll first
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null); // NY: hvilken dag vi er over
  // Dev logging throttle
  const lastLogRef = useRef<number>(0);
  const logEveryMs = 150; // throttle logs
  const scrollLockRef = useRef<{ y: number; styles: Partial<CSSStyleDeclaration> } | null>(null);

  const devLog = useCallback((label: string, payload: any) => {
    if (process.env.NODE_ENV !== "development") return;
    const now = Date.now();
    if (now - lastLogRef.current < logEveryMs) return;
    lastLogRef.current = now;
    // eslint-disable-next-line no-console
    console.log(`[dnd-dev] ${label}`, payload);
  }, []);

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
      setLastSavedIds(res.days.map((d) => d.recipe?.id ?? null));
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
        setLastSavedIds(payload.days.map((d) => d.recipe?.id ?? null));
        if (!opts?.suppressRefetch) {
          timelineQuery.refetch().catch(() => undefined);
        }
      } catch (err) {
        console.error("Kunne ikke lagre ukeplan", err);
      }
    },
    [activeWeekStart, saveWeek, applyWeekData, timelineQuery]
  );

  // Suggestions are provided server-side with getWeekPlan/applyWeekData,
  // and updated on save/applyWeekData. No manual refresh button or effect needed.

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
    // Mark body as dragging to disable problematic CSS (filters/blur) that can offset overlays
    if (typeof document !== "undefined") {
      document.body.classList.add("dragging");
      // Lock body scroll on mobile to stabilize VisualViewport/coordinates
      if (typeof window !== "undefined") {
        const y = window.scrollY || window.pageYOffset || 0;
        const prev: Partial<CSSStyleDeclaration> = {
          position: document.body.style.position,
          top: document.body.style.top,
          left: document.body.style.left,
          right: document.body.style.right,
          width: document.body.style.width,
        };
        scrollLockRef.current = { y, styles: prev };
        document.body.style.position = "fixed";
        document.body.style.top = `-${y}px`;
        document.body.style.left = "0";
        document.body.style.right = "0";
        document.body.style.width = "100%";
      }
    }
    try {
      const vv = (typeof window !== "undefined" && (window as any).visualViewport) || null;
      devLog("start", {
        active: event.active,
        scrollX: typeof window !== "undefined" ? window.scrollX : undefined,
        scrollY: typeof window !== "undefined" ? window.scrollY : undefined,
        vv: vv ? { pageTop: vv.pageTop, pageLeft: vv.pageLeft, offsetTop: vv.offsetTop, offsetLeft: vv.offsetLeft, scale: vv.scale, width: vv.width, height: vv.height } : null,
      });
    } catch { }
  }, []);

  const onDragOver = useCallback((event: any) => {
    const overId: string | null = event.over ? String(event.over.id) : null;
    if (overId && overId.startsWith("day-")) {
      const idx = Number(overId.slice(4));
      setOverIndex(Number.isFinite(idx) ? idx : null);
    } else {
      setOverIndex(null);
    }
    try {
      devLog("over", {
        over: event.over,
        delta: event.delta,
        collisions: event.collisions,
      });
    } catch { }
  }, []);

  const onDragCancel = useCallback(() => {
    setActiveId(null);
    setOverIndex(null);
    if (typeof document !== "undefined") {
      document.body.classList.remove("dragging");
      // Restore scroll lock
      const lock = scrollLockRef.current;
      if (lock) {
        const prev = lock.styles;
        document.body.style.position = prev.position ?? "";
        document.body.style.top = prev.top ?? "";
        document.body.style.left = prev.left ?? "";
        document.body.style.right = prev.right ?? "";
        document.body.style.width = prev.width ?? "";
        if (typeof window !== "undefined") {
          window.scrollTo(0, lock.y);
        }
        scrollLockRef.current = null;
      }
    }
    devLog("cancel", null);
  }, []);

  const onDragEnd = useCallback(async (event: any) => {
    const { active, over } = event;
    setActiveId(null);
    setOverIndex(null);
    if (typeof document !== "undefined") {
      document.body.classList.remove("dragging");
      // Restore scroll lock
      const lock = scrollLockRef.current;
      if (lock) {
        const prev = lock.styles;
        document.body.style.position = prev.position ?? "";
        document.body.style.top = prev.top ?? "";
        document.body.style.left = prev.left ?? "";
        document.body.style.right = prev.right ?? "";
        document.body.style.width = prev.width ?? "";
        if (typeof window !== "undefined") {
          window.scrollTo(0, lock.y);
        }
        scrollLockRef.current = null;
      }
    }
    try {
      devLog("end", {
        active,
        over,
        delta: event.delta,
      });
    } catch { }
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

  // ScrollArea centers active week within WeekSelector itself.

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

  const handleSelectWeek = async (weekStart: string) => {
    const normalized = startOfWeekISO(weekStart);
    // If clicking the same week, do nothing
    if (normalized === activeWeekStart) return;

    // Save current week if there are unsaved changes before navigating
    const currentIds = week.map((r) => r?.id ?? null);
    const isDirty = !lastSavedIds || currentIds.length !== lastSavedIds.length || currentIds.some((id, i) => id !== lastSavedIds[i]);
    if (isDirty && !saveWeek.isPending) {
      try {
        const payload = await saveWeek.mutateAsync({
          weekStart: activeWeekStart,
          recipeIdsByDay: currentIds,
        });
        applyWeekData(payload);
        setLastSavedIds(payload.days.map((d) => d.recipe?.id ?? null));
      } catch (err) {
        console.error("Kunne ikke lagre uke før navigasjon", err);
      }
    }

    setActiveWeekStart(normalized);
  };

  // Periodic autosave if there are changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    const interval = window.setInterval(async () => {
      const currentIds = week.map((r) => r?.id ?? null);
      const isDirty = !lastSavedIds || currentIds.length !== lastSavedIds.length || currentIds.some((id, i) => id !== lastSavedIds[i]);
      if (isDirty && !saveWeek.isPending) {
        try {
          const payload = await saveWeek.mutateAsync({
            weekStart: activeWeekStart,
            recipeIdsByDay: currentIds,
          });
          applyWeekData(payload);
          setLastSavedIds(payload.days.map((d) => d.recipe?.id ?? null));
          timelineQuery.refetch().catch(() => undefined);
        } catch (err) {
          // ignore transient errors
        }
      }
    }, 30000); // every 30s
    return () => window.clearInterval(interval);
  }, [week, lastSavedIds, saveWeek, activeWeekStart, applyWeekData, timelineQuery]);

  const overlayPayload = useMemo(() => (activeId ? parseDragId(activeId) : null), [activeId]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const portalTarget = typeof document === "undefined" ? null : document.body;

  const _isTouch = useIsTouchDevice();

  // Prefer intersection when the pointer/overlay overlaps a day; otherwise fall back to closest center
  const collisionAlgo = useCallback((args: any) => {
    const pointerHits = pointerWithin(args);
    if (pointerHits.length) return pointerHits;
    const intersections = rectIntersection(args);
    return intersections.length ? intersections : closestCenter(args);
  }, []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionAlgo}
      autoScroll={true}
      modifiers={_isTouch ? [restrictToWindowEdges, snapCenterToCursor] : [restrictToWindowEdges]}
      measuring={{
        droppable: {
          strategy: MeasuringStrategy.Always,
        },
      }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragCancel={onDragCancel}
      onDragEnd={onDragEnd}
    >
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-center">Ukesplan</h1>

        <div className="space-y-3">
          <WeekSelector
            weeks={timelineWeeks.map((w, i) => ({ week: w, index: i }))}
            activeWeekStart={activeWeekStart}
            activeWeekIndex={activeWeekIndex}
            onSelectWeek={handleSelectWeek}
          />

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
            onSearchTermChange={setSearchTerm}
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
                onPick={(recipe) => handlePickFromSource("longGap", recipe)}
              />

              <SuggestionSection
                title="Ofte brukt"
                recipes={frequent}
                source="frequent"
                selectedIdSet={selectedIdSet}
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
          <DragOverlay
            adjustScale={false}
            dropAnimation={{ duration: 150, easing: "ease-out" }}
            style={{ pointerEvents: "none", zIndex: 1100 }}
          >
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
