"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "../../lib/trpcClient";
import { WeekSlot } from "./components/WeekSlot";
import { WeekSelector } from "./components/WeekSelector";
import { SuggestionSection } from "./components/SuggestionSection";
import { SearchSection } from "./components/SearchSection";
import { MobileEditor } from "./components/MobileEditor";
import { CategoryEmoji } from "../components/CategoryEmoji";
import { startOfWeekISO, addWeeksISO, deriveWeekLabel } from "../../lib/week";

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import { createPortal } from "react-dom";

import type { DragPayload, RecipeDTO, WeekPlanResult, WeekState } from "./types";
import { makeEmptyWeek, parseDragId } from "./utils";

const DAY_NAMES = [
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
  "Søndag",
] as const;

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
  const [isMobileEditorOpen, setIsMobileEditorOpen] = useState(false);
  const [mobileEditorView, setMobileEditorView] = useState<"frequent" | "longGap" | "search">("frequent");

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    })
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const weekPlanQuery = trpc.planner.getWeekPlan.useQuery(
    { weekStart: activeWeekStart },
    { enabled: Boolean(activeWeekStart) }
  );
  const timelineQuery = trpc.planner.weekTimeline.useQuery({ around: currentWeekStart });

  const saveWeek = trpc.planner.saveWeekPlan.useMutation();

  const selectedIds = useMemo(
    () => week.filter((recipe): recipe is RecipeDTO => Boolean(recipe)).map((recipe) => recipe.id),
    [week]
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const applyWeekData = useCallback(
    (res: WeekPlanResult) => {
      const nextWeek = res.days.map((day) => day.recipe ?? null) as WeekState;
      const currentIds = new Set(
        nextWeek.filter((recipe): recipe is RecipeDTO => Boolean(recipe)).map((r) => r.id.toLowerCase())
      );
      setWeek(nextWeek);
      setLongGap(res.suggestions.longGap.filter((item) => !currentIds.has(item.id.toLowerCase())));
      setFrequent(res.suggestions.frequent.filter((item) => !currentIds.has(item.id.toLowerCase())));
      utils.planner.getWeekPlan.setData({ weekStart: res.weekStart }, res);
    },
    [utils]
  );

  useEffect(() => {
    if (weekPlanQuery.data) {
      applyWeekData(weekPlanQuery.data);
    }
  }, [weekPlanQuery.data, applyWeekData]);

  const commitWeekPlan = useCallback(
    async (nextWeek: WeekState) => {
      setWeek(nextWeek);
      const ids = nextWeek.map((recipe) => recipe?.id ?? null);

      try {
        const payload = await saveWeek.mutateAsync({
          weekStart: activeWeekStart,
          recipeIdsByDay: ids,
        });
        applyWeekData(payload);
      } catch (error) {
        console.error("Failed to save week plan:", error);
      }
    },
    [activeWeekStart, saveWeek, applyWeekData]
  );

  const handleDragStart = useCallback((event: any) => {
    setActiveId(event.active.id);
  }, []);

  const handleDragOver = useCallback((event: any) => {
    const { over } = event;
    if (!over) {
      setOverIndex(null);
      return;
    }
    const payload = parseDragId(over.id);
    if (payload?.source === "week") {
      setOverIndex(payload.index);
    } else {
      setOverIndex(null);
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: any) => {
      const { active, over } = event;
      setActiveId(null);
      setOverIndex(null);

      if (!over) return;

      const activePayload = parseDragId(active.id) as DragPayload;
      const overPayload = parseDragId(over.id);

      if (!activePayload || !overPayload) return;

      // Dragging from week to week (swap)
      if (activePayload.source === "week" && overPayload.source === "week") {
        const fromIndex = activePayload.index;
        const toIndex = overPayload.index;
        if (fromIndex === toIndex) return;

        const nextWeek = [...week];
        const temp = nextWeek[fromIndex];
        nextWeek[fromIndex] = nextWeek[toIndex];
        nextWeek[toIndex] = temp;
        commitWeekPlan(nextWeek);
      }

      // Dragging from suggestion to week (add)
      if (activePayload.source !== "week" && overPayload.source === "week") {
        const recipe =
          activePayload.source === "longGap"
            ? longGap[activePayload.index]
            : activePayload.source === "frequent"
              ? frequent[activePayload.index]
              : activePayload.source === "search"
                ? searchResults[activePayload.index]
                : null;

        if (recipe) {
          const nextWeek = [...week];
          nextWeek[overPayload.index] = recipe;
          commitWeekPlan(nextWeek);
        }
      }
    },
    [week, commitWeekPlan, longGap, frequent, searchResults]
  ); const handlePickFromSource = useCallback(
    (source: "longGap" | "frequent" | "search", recipe: RecipeDTO) => {
      // Find first empty slot
      const emptyIndex = week.findIndex((slot) => slot === null);
      if (emptyIndex !== -1) {
        const nextWeek = [...week];
        nextWeek[emptyIndex] = recipe;
        commitWeekPlan(nextWeek);
      }
    },
    [week, commitWeekPlan]
  );

  // Search logic with debouncing
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchTerm.trim()) {
      setDebouncedSearchTerm("");
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    setSearchLoading(true);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  const searchQuery = trpc.recipe.list.useQuery(
    { search: debouncedSearchTerm, pageSize: 10 },
    { enabled: Boolean(debouncedSearchTerm) }
  );

  useEffect(() => {
    if (searchQuery.data) {
      setSearchResults(searchQuery.data.items);
      setSearchError(null);
      setSearchLoading(false);
    } else if (searchQuery.error) {
      setSearchError("Søket feilet. Prøv igjen.");
      setSearchLoading(false);
    }
  }, [searchQuery.data, searchQuery.error]);

  const activeDragPayload = activeId ? parseDragId(activeId) : null;
  const activeDragRecipe = useMemo(() => {
    if (!activeDragPayload) return null;
    if (activeDragPayload.source === "week") return week[activeDragPayload.index];
    if (activeDragPayload.source === "longGap") return longGap[activeDragPayload.index];
    if (activeDragPayload.source === "frequent") return frequent[activeDragPayload.index];
    if (activeDragPayload.source === "search") return searchResults[activeDragPayload.index];
    return null;
  }, [activeDragPayload, week, longGap, frequent, searchResults]);

  const weekLabel = useMemo(
    () => deriveWeekLabel(activeWeekStart, currentWeekStart),
    [activeWeekStart, currentWeekStart]
  );

  const timelineWeeks = useMemo(() => {
    const weeks = timelineQuery.data?.weeks ?? [];
    return weeks.map((w) => ({
      ...w,
      label: deriveWeekLabel(w.weekStart, currentWeekStart),
    }));
  }, [timelineQuery.data, currentWeekStart]);

  const activeWeekIndex = timelineWeeks.findIndex((w) => w.weekStart === activeWeekStart);

  const handleSelectWeek = useCallback((weekStart: string) => {
    setActiveWeekStart(weekStart);
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-center">Ukesplan</h1>

      <WeekSelector
        weeks={timelineWeeks.map((w, i) => ({ week: w, index: i }))}
        activeWeekStart={activeWeekStart}
        activeWeekIndex={activeWeekIndex}
        onSelectWeek={handleSelectWeek}
      />

      {/* Mobile version - separate DndContext to avoid offset issues */}
      <div className="sm:hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
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

          {typeof document !== "undefined" &&
            createPortal(
              <DragOverlay>
                {activeDragRecipe ? (
                  <div className="p-6 bg-gradient-to-br from-blue-500 to-purple-600 text-white rounded-xl shadow-2xl border-2 border-white/20 min-w-[200px]">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <div className="font-bold text-lg">{activeDragRecipe.name}</div>
                      {activeDragRecipe.category && (
                        <CategoryEmoji category={activeDragRecipe.category as any} />
                      )}
                      {overIndex !== null && (
                        <div className="mt-2 text-sm opacity-90">
                          → {DAY_NAMES[overIndex]}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </DragOverlay>,
              document.body
            )}
        </DndContext>
      </div>

      {/* Desktop version - separate DndContext */}
      <div className="hidden sm:block">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 auto-rows-fr">
            {week.map((recipe, index) => (
              <WeekSlot
                key={index}
                index={index}
                dayName={DAY_NAMES[index]}
                recipe={recipe}
              />
            ))}
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
              searchTerm={searchTerm}
              searchResults={searchResults}
              searchLoading={searchLoading}
              searchError={searchError}
              selectedIdSet={selectedIdSet}
              onSearchTermChange={setSearchTerm}
              onPick={(recipe) => handlePickFromSource("search", recipe)}
            />
          </div>

          {typeof document !== "undefined" &&
            createPortal(
              <DragOverlay>
                {activeDragRecipe ? (
                  <div className="p-6 bg-gradient-to-br from-blue-500 to-purple-600 text-white rounded-xl shadow-2xl border-2 border-white/20 min-w-[200px]">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <div className="font-bold text-lg">{activeDragRecipe.name}</div>
                      {activeDragRecipe.category && (
                        <CategoryEmoji category={activeDragRecipe.category as any} />
                      )}
                      {overIndex !== null && (
                        <div className="mt-2 text-sm opacity-90">
                          → {DAY_NAMES[overIndex]}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </DragOverlay>,
              document.body
            )}
        </DndContext>
      </div>

      {weekPlanQuery.isLoading && (
        <div className="text-center text-muted-foreground">Laster ukesplan...</div>
      )}
    </div>
  );
}
