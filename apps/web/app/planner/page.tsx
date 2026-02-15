"use client";
/* eslint-disable no-undef */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "../../lib/trpcClient";
import { WeekSlot } from "./components/WeekSlot";
import { WeekSelector } from "./components/WeekSelector";
import { SuggestionSection } from "./components/SuggestionSection";
import { SearchSection } from "./components/SearchSection";
import { MobileEditor } from "./components/MobileEditor";
import { RecipePickerModal } from "./components/RecipePickerModal";
import { CategoryEmoji } from "../components/CategoryEmoji";
import { startOfWeekISO, deriveWeekLabel } from "../../lib/week";
import { RecipeViewDialog } from "../recipes/components/RecipeViewDialog";
import { RecipeFormDialog } from "../recipes/components/RecipeFormDialog";
import { STEP_DESCRIPTIONS, STEP_TITLES } from "../recipes/constants";
import type { RecipeListItem } from "../recipes/types";
import { useRecipeDialogState } from "../recipes/hooks/useRecipeDialogState";

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import type { DropAnimation } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { createPortal } from "react-dom";

import type { DragPayload, RecipeDTO, WeekEntry, WeekPlanResult, WeekState } from "./types";
import type { MockWeekTimelineResult } from "../../lib/mock/store";
import { makeEmptyWeek, parseDragId, reorderDayNames, reorderWeek, toRealIndex, ALL_DAY_NAMES } from "./utils";
import { DisplayOptions } from "./components/DisplayOptions";
import { addWeeksISO } from "../../lib/week";

// Custom drop animation for smoother feel
const dropAnimationConfig: DropAnimation = {
  duration: 200,
  easing: "cubic-bezier(0.25, 0.1, 0.25, 1.0)",
};

export default function PlannerPage() {
  const utils = trpc.useUtils();
  const currentWeekStart = useMemo(() => startOfWeekISO(), []);
  const [activeWeekStart, setActiveWeekStart] = useState(currentWeekStart);
  const [week, setWeek] = useState<WeekState>(makeEmptyWeek);
  const [previewWeek, setPreviewWeek] = useState<WeekState | null>(null);
  const [draggingWeekIndex, setDraggingWeekIndex] = useState<number | null>(null);
  const [draggingWeekOffset, setDraggingWeekOffset] = useState<number>(0);
  const [startDay, setStartDay] = useState(0);
  const [showNextWeek, setShowNextWeek] = useState(false);
  const [nextWeek, setNextWeek] = useState<WeekState>(makeEmptyWeek);
  const [previewNextWeek, setPreviewNextWeek] = useState<WeekState | null>(null);
  const [longGap, setLongGap] = useState<RecipeDTO[]>([]);
  const [frequent, setFrequent] = useState<RecipeDTO[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<RecipeDTO[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // State for mobile recipe picker modal
  const [editingDayIndex, setEditingDayIndex] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 8,
      },
    })
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const weekPlanQuery = trpc.planner.getWeekPlan.useQuery(
    { weekStart: activeWeekStart },
    { enabled: Boolean(activeWeekStart) }
  );
  const nextWeekStart = useMemo(() => addWeeksISO(activeWeekStart, 1), [activeWeekStart]);
  const nextWeekPlanQuery = trpc.planner.getWeekPlan.useQuery(
    { weekStart: nextWeekStart },
    { enabled: Boolean(nextWeekStart) && showNextWeek }
  );
  const timelineQuery = trpc.planner.weekTimeline.useQuery({ around: currentWeekStart });

  const saveWeek = trpc.planner.saveWeekPlan.useMutation();

  const recipeDialogItems = useMemo<RecipeListItem[]>(() => {
    const map = new Map<string, RecipeDTO>();
    const baseWeek = previewWeek ?? week;
    baseWeek.forEach((entry) => {
      if (entry?.type === "RECIPE") map.set(entry.recipe.id, entry.recipe);
    });
    const baseNextWeek = previewNextWeek ?? nextWeek;
    baseNextWeek.forEach((entry) => {
      if (entry?.type === "RECIPE") map.set(entry.recipe.id, entry.recipe);
    });
    longGap.forEach((recipe) => {
      map.set(recipe.id, recipe);
    });
    frequent.forEach((recipe) => {
      map.set(recipe.id, recipe);
    });
    searchResults.forEach((recipe) => {
      map.set(recipe.id, recipe);
    });
    return Array.from(map.values()) as RecipeListItem[];
  }, [previewWeek, week, previewNextWeek, nextWeek, longGap, frequent, searchResults]);

  const {
    dialogContentClassName,
    viewDialogContentClassName,
    isEditDialogOpen,
    onFormOpenChange,
    openCreate,
    openView,
    createIsPending,
    updateIsPending,
    editId,
    currentStep,
    isLastStep,
    nextDisabled,
    nextLabel,
    carouselApi,
    setCarouselApi,
    name,
    setName,
    matchingRecipes,
    onSelectExistingRecipe,
    cat,
    setCat,
    everyday,
    setEveryday,
    health,
    setHealth,
    desc,
    setDesc,
    ingSearch,
    setIngSearch,
    trimmedIngSearch,
    ingredientSuggestions,
    isIngredientQueryFetching,
    ingList,
    addIngredientByName,
    removeIngredient,
    upsertQuantity,
    upsertUnit,
    persistUnit,
    submitRecipe,
    isViewDialogOpen,
    onViewOpenChange,
    viewRecipe,
    viewCurrentStep,
    viewCarouselApi,
    setViewCarouselApi,
    formatIngredientLine,
    startEditFromView,
  } = useRecipeDialogState({
    recipes: recipeDialogItems,
    stepTitles: STEP_TITLES,
    hideTrigger: true,
    onUpdateSuccess: async () => {
      await utils.recipe.list.invalidate().catch(() => undefined);
      await utils.planner.getWeekPlan.invalidate({ weekStart: activeWeekStart }).catch(() => undefined);
      await weekPlanQuery.refetch().catch(() => undefined);
    },
  });

  const handleRecipeClick = useCallback((recipe: RecipeDTO) => {
    // Close the picker modal first to prevent overlapping dialogs
    setEditingDayIndex(null);
    openView(recipe.id);
  }, [openView]);

  const applyWeekData = useCallback(
    (res: WeekPlanResult) => {
      const weekState = res.days.map((day) => {
        if (day.entryType === "TAKEAWAY") {
          return { type: "TAKEAWAY" } satisfies WeekEntry;
        }
        if (day.recipe) {
          return { type: "RECIPE", recipe: day.recipe } satisfies WeekEntry;
        }
        return null;
      }) as WeekState;
      setWeek(weekState);
      setPreviewWeek(null);
      setDraggingWeekIndex(null);
      setLongGap(res.suggestions.longGap);
      setFrequent(res.suggestions.frequent);
      utils.planner.getWeekPlan.setData({ weekStart: res.weekStart }, res);
    },
    [utils]
  );

  const applyNextWeekData = useCallback(
    (res: WeekPlanResult) => {
      const weekState = res.days.map((day) => {
        if (day.entryType === "TAKEAWAY") {
          return { type: "TAKEAWAY" } satisfies WeekEntry;
        }
        if (day.recipe) {
          return { type: "RECIPE", recipe: day.recipe } satisfies WeekEntry;
        }
        return null;
      }) as WeekState;
      setNextWeek(weekState);
      setPreviewNextWeek(null);
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
    if (nextWeekPlanQuery.data) {
      applyNextWeekData(nextWeekPlanQuery.data);
    }
  }, [nextWeekPlanQuery.data, applyNextWeekData]);


  const commitWeekPlan = useCallback(
    async (newWeek: WeekState, weekStart: string = activeWeekStart) => {
      const isNext = weekStart !== activeWeekStart;
      if (isNext) {
        setNextWeek(newWeek);
      } else {
        setWeek(newWeek);
      }
      const days = newWeek.map((entry) => {
        if (entry?.type === "RECIPE") {
          return { type: "RECIPE" as const, recipeId: entry.recipe.id };
        }
        if (entry?.type === "TAKEAWAY") {
          return { type: "TAKEAWAY" as const };
        }
        return { type: "EMPTY" as const };
      });

      try {
        const payload = await saveWeek.mutateAsync({
          weekStart,
          days,
        });
        if (isNext) {
          applyNextWeekData(payload);
        } else {
          applyWeekData(payload);
        }
      } catch (error) {
        console.error("Failed to save week plan:", error);
      }
    },
    [activeWeekStart, saveWeek, applyWeekData, applyNextWeekData]
  );

  const getWeekForOffset = useCallback((offset: number): WeekState => offset === 1 ? nextWeek : week, [week, nextWeek]);
  const getWeekStartForOffset = useCallback((offset: number): string => offset === 1 ? nextWeekStart : activeWeekStart, [activeWeekStart, nextWeekStart]);

  const handleDragStart = useCallback(
    (event: any) => {
      setActiveId(event.active.id);
      const payload = parseDragId(event.active.id);
      if (payload?.source === "week") {
        const offset = payload.weekOffset ?? 0;
        setDraggingWeekOffset(offset);
        if (offset === 1) {
          setPreviewNextWeek([...nextWeek]);
        } else {
          setPreviewWeek([...week]);
        }
        setDraggingWeekIndex(payload.index);
      }
    },
    [week, nextWeek]
  );

  const handleDragOver = useCallback(
    (event: any) => {
      const { active, over } = event;
      if (!over) {
        setOverIndex(null);
        return;
      }
      const overPayload = parseDragId(over.id);
      if (overPayload?.source === "week") {
        setOverIndex(overPayload.index);
      } else {
        setOverIndex(null);
      }

      const activePayload = parseDragId(active.id);

      // Same-week reorder preview
      if (
        activePayload?.source === "week" &&
        overPayload?.source === "week" &&
        (activePayload.weekOffset ?? 0) === (overPayload.weekOffset ?? 0) &&
        draggingWeekIndex !== null &&
        overPayload.index !== draggingWeekIndex
      ) {
        const offset = activePayload.weekOffset ?? 0;
        const setter = offset === 1 ? setPreviewNextWeek : setPreviewWeek;
        const base = offset === 1 ? nextWeek : week;
        setter((current) => {
          const arr = current ?? [...base];
          return arrayMove(arr, draggingWeekIndex, overPayload.index);
        });
        setDraggingWeekIndex(overPayload.index);
      }
    },
    [draggingWeekIndex, week, nextWeek]
  );

  const handleDragEnd = useCallback(
    (event: any) => {
      const { active, over } = event;
      setActiveId(null);
      setOverIndex(null);
      setPreviewWeek(null);
      setPreviewNextWeek(null);
      setDraggingWeekIndex(null);
      setDraggingWeekOffset(0);

      if (!over) return;

      const activePayload = parseDragId(active.id) as DragPayload;
      const overPayload = parseDragId(over.id);

      if (!activePayload || !overPayload) return;

      const fromOffset = activePayload.weekOffset ?? 0;
      const toOffset = overPayload.weekOffset ?? 0;

      // Dragging within same week (reorder)
      if (activePayload.source === "week" && overPayload.source === "week" && fromOffset === toOffset) {
        const fromIndex = activePayload.index;
        const toIndex = overPayload.index;
        if (fromIndex === toIndex) return;
        const sourceWeek = getWeekForOffset(fromOffset);
        const reordered = arrayMove(sourceWeek, fromIndex, toIndex);
        commitWeekPlan(reordered, getWeekStartForOffset(fromOffset));
      }

      // Dragging between weeks (swap)
      if (activePayload.source === "week" && overPayload.source === "week" && fromOffset !== toOffset) {
        const fromWeek = [...getWeekForOffset(fromOffset)];
        const toWeek = [...getWeekForOffset(toOffset)];
        const fromEntry = fromWeek[activePayload.index];
        const toEntry = toWeek[overPayload.index];
        fromWeek[activePayload.index] = toEntry;
        toWeek[overPayload.index] = fromEntry;
        commitWeekPlan(fromWeek, getWeekStartForOffset(fromOffset));
        commitWeekPlan(toWeek, getWeekStartForOffset(toOffset));
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
          const targetWeek = [...getWeekForOffset(toOffset)];
          targetWeek[overPayload.index] = { type: "RECIPE", recipe };
          commitWeekPlan(targetWeek, getWeekStartForOffset(toOffset));
        }
      }
    },
    [week, nextWeek, commitWeekPlan, longGap, frequent, searchResults, getWeekForOffset, getWeekStartForOffset]
  ); const handlePickFromSource = useCallback(
    (source: "longGap" | "frequent" | "search", recipe: RecipeDTO) => {
      // Find first empty slot
      const emptyIndex = week.findIndex((slot) => slot === null);
      if (emptyIndex !== -1) {
        const newWeek = [...week];
        newWeek[emptyIndex] = { type: "RECIPE", recipe };
        commitWeekPlan(newWeek);
      }
    },
    [week, commitWeekPlan]
  );

  const handleSetTakeaway = useCallback(
    (dayIndex: number, weekOffset: number = 0) => {
      const sourceWeek = getWeekForOffset(weekOffset);
      const newWeek = [...sourceWeek];
      newWeek[dayIndex] = { type: "TAKEAWAY" };
      commitWeekPlan(newWeek, getWeekStartForOffset(weekOffset));
    },
    [getWeekForOffset, getWeekStartForOffset, commitWeekPlan]
  );

  const handleClearEntry = useCallback(
    (dayIndex: number, weekOffset: number = 0) => {
      const sourceWeek = getWeekForOffset(weekOffset);
      const newWeek = [...sourceWeek];
      newWeek[dayIndex] = null;
      commitWeekPlan(newWeek, getWeekStartForOffset(weekOffset));
    },
    [getWeekForOffset, getWeekStartForOffset, commitWeekPlan]
  );

  // Handler for opening recipe picker modal (mobile)
  const handleRequestChange = useCallback((dayIndex: number) => {
    setEditingDayIndex(dayIndex);
  }, []);

  // Handler for selecting recipe from modal
  const handleSelectRecipeFromModal = useCallback(
    (recipe: RecipeDTO, dayIndex: number) => {
      const newWeek = [...week];
      newWeek[dayIndex] = { type: "RECIPE", recipe };
      commitWeekPlan(newWeek);
    },
    [week, commitWeekPlan]
  );

  // Search logic with debouncing
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const displayWeek = previewWeek ?? week;
  const displayNextWeek = previewNextWeek ?? nextWeek;

  const dayNames = useMemo(() => reorderDayNames(startDay), [startDay]);
  const reorderedWeek = useMemo(() => reorderWeek(displayWeek, startDay), [displayWeek, startDay]);
  const reorderedNextWeek = useMemo(() => reorderWeek(displayNextWeek, startDay), [displayNextWeek, startDay]);

  const activeDragRecipe = useMemo(() => {
    if (!activeDragPayload) return null;
    if (activeDragPayload.source === "week") {
      const sourceWeek = (activeDragPayload.weekOffset ?? 0) === 1 ? nextWeek : week;
      const entry = sourceWeek[activeDragPayload.index];
      return entry?.type === "RECIPE" ? entry.recipe : null;
    }
    if (activeDragPayload.source === "longGap") return longGap[activeDragPayload.index];
    if (activeDragPayload.source === "frequent") return frequent[activeDragPayload.index];
    if (activeDragPayload.source === "search") return searchResults[activeDragPayload.index];
    return null;
  }, [activeDragPayload, week, nextWeek, longGap, frequent, searchResults]);

  const timelineWeeks = useMemo(() => {
    const rawWeeks = timelineQuery.data?.weeks ?? [];
    const weeks = rawWeeks as MockWeekTimelineResult["weeks"];
    return weeks.map((week) => ({
      ...week,
      label: deriveWeekLabel(week.weekStart, currentWeekStart),
    }));
  }, [timelineQuery.data, currentWeekStart]);

  const activeWeekIndex = timelineWeeks.findIndex((w) => w.weekStart === activeWeekStart);

  const handleSelectWeek = useCallback((weekStart: string) => {
    setActiveWeekStart(weekStart);
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="hidden text-xl font-bold text-center md:block">Ukesplan</h1>

      <div className="flex items-center justify-between gap-3">
        <WeekSelector
          weeks={timelineWeeks.map((w, i) => ({ week: w, index: i }))}
          activeWeekStart={activeWeekStart}
          activeWeekIndex={activeWeekIndex}
          onSelectWeek={handleSelectWeek}
        />
        <DisplayOptions
          startDay={startDay}
          onStartDayChange={setStartDay}
          showNextWeek={showNextWeek}
          onShowNextWeekChange={setShowNextWeek}
        />
      </div>

      <RecipeFormDialog
        open={isEditDialogOpen}
        onOpenChange={onFormOpenChange}
        onCreateClick={openCreate}
        dialogContentClassName={dialogContentClassName}
        editId={editId}
        currentStep={currentStep}
        stepTitles={STEP_TITLES}
        stepDescriptions={STEP_DESCRIPTIONS}
        carouselApi={carouselApi}
        setCarouselApi={setCarouselApi}
        isLastStep={isLastStep}
        nextDisabled={nextDisabled}
        nextLabel={nextLabel}
        name={name}
        onNameChange={setName}
        matchingRecipes={matchingRecipes}
        onSelectExistingRecipe={onSelectExistingRecipe}
        cat={cat}
        onCategoryChange={setCat}
        everyday={everyday}
        onEverydayChange={setEveryday}
        health={health}
        onHealthChange={setHealth}
        desc={desc}
        onDescChange={setDesc}
        ingSearch={ingSearch}
        onIngSearchChange={setIngSearch}
        trimmedIngSearch={trimmedIngSearch}
        ingredientSuggestions={ingredientSuggestions}
        isIngredientQueryFetching={isIngredientQueryFetching}
        ingList={ingList}
        addIngredientByName={addIngredientByName}
        removeIngredient={removeIngredient}
        upsertQuantity={upsertQuantity}
        upsertUnit={upsertUnit}
        persistUnit={persistUnit}
        onSubmit={submitRecipe}
        createIsPending={createIsPending}
        updateIsPending={updateIsPending}
        hideTrigger
      />

      <RecipeViewDialog
        open={isViewDialogOpen}
        onOpenChange={onViewOpenChange}
        dialogContentClassName={viewDialogContentClassName}
        viewRecipe={viewRecipe}
        viewCurrentStep={viewCurrentStep}
        viewCarouselApi={viewCarouselApi}
        setViewCarouselApi={setViewCarouselApi}
        formatIngredientLine={formatIngredientLine}
        onEdit={startEditFromView}
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
            week={reorderedWeek}
            dayNames={dayNames}
            startDay={startDay}
            weekOffset={0}
            onRequestChange={handleRequestChange}
            onSetTakeaway={(i) => handleSetTakeaway(toRealIndex(i, startDay), 0)}
            onClearEntry={(i) => handleClearEntry(toRealIndex(i, startDay), 0)}
          />

          {showNextWeek && (
            <>
              <div className="mt-4 mb-2 text-xs font-semibold text-muted-foreground text-center">Neste uke</div>
              <MobileEditor
                week={reorderedNextWeek}
                dayNames={dayNames}
                startDay={startDay}
                weekOffset={1}
                onRequestChange={handleRequestChange}
                onSetTakeaway={(i) => handleSetTakeaway(toRealIndex(i, startDay), 1)}
                onClearEntry={(i) => handleClearEntry(toRealIndex(i, startDay), 1)}
              />
            </>
          )}

          <RecipePickerModal
            open={editingDayIndex !== null}
            onOpenChange={(open) => {
              if (!open) setEditingDayIndex(null);
            }}
            currentEntry={editingDayIndex !== null ? displayWeek[editingDayIndex] : null}
            dayName={editingDayIndex !== null ? ALL_DAY_NAMES[editingDayIndex] : "Mandag"}
            dayIndex={editingDayIndex ?? 0}
            longGap={longGap}
            frequent={frequent}
            onSelectRecipe={handleSelectRecipeFromModal}
            onViewRecipe={handleRecipeClick}
            onSetTakeaway={handleSetTakeaway}
            onClearEntry={handleClearEntry}
          />

          {typeof document !== "undefined" &&
            createPortal(
              <DragOverlay dropAnimation={dropAnimationConfig}>
                {activeDragRecipe ? (
                  <div className="p-6 bg-gradient-to-br from-blue-500 to-purple-600 text-white rounded-xl shadow-2xl border-2 border-white/20 min-w-[200px]">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <div className="font-bold text-lg">{activeDragRecipe.name}</div>
                      {activeDragRecipe.category && (
                        <CategoryEmoji category={activeDragRecipe.category as any} />
                      )}
                      {overIndex !== null && (
                        <div className="mt-2 text-sm opacity-90">
                          → {ALL_DAY_NAMES[overIndex]}
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
            {reorderedWeek.map((entry, displayIdx) => {
              const realIdx = toRealIndex(displayIdx, startDay);
              return (
                <WeekSlot
                  key={`w0-${realIdx}`}
                  index={realIdx}
                  dayName={dayNames[displayIdx]}
                  entry={entry}
                  weekOffset={0}
                  onRecipeClick={handleRecipeClick}
                  onSetTakeaway={() => handleSetTakeaway(realIdx, 0)}
                  onClearEntry={() => handleClearEntry(realIdx, 0)}
                />
              );
            })}
          </div>

          {showNextWeek && (
            <>
              <div className="mt-4 mb-2 text-xs font-semibold text-muted-foreground text-center">Neste uke</div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 auto-rows-fr">
                {reorderedNextWeek.map((entry, displayIdx) => {
                  const realIdx = toRealIndex(displayIdx, startDay);
                  return (
                    <WeekSlot
                      key={`w1-${realIdx}`}
                      index={realIdx}
                      dayName={dayNames[displayIdx]}
                      entry={entry}
                      weekOffset={1}
                      onRecipeClick={handleRecipeClick}
                      onSetTakeaway={() => handleSetTakeaway(realIdx, 1)}
                      onClearEntry={() => handleClearEntry(realIdx, 1)}
                    />
                  );
                })}
              </div>
            </>
          )}

          <div className="space-y-4">
            <SuggestionSection
              title="Lenge siden sist"
              recipes={longGap}
              source="longGap"
              onPick={(recipe) => handlePickFromSource("longGap", recipe)}
            />

            <SuggestionSection
              title="Ofte brukt"
              recipes={frequent}
              source="frequent"
              onPick={(recipe) => handlePickFromSource("frequent", recipe)}
            />

            <SearchSection
              searchTerm={searchTerm}
              searchResults={searchResults}
              searchLoading={searchLoading}
              searchError={searchError}
              onSearchTermChange={setSearchTerm}
              onPick={(recipe) => handlePickFromSource("search", recipe)}
            />
          </div>

          {typeof document !== "undefined" &&
            createPortal(
              <DragOverlay dropAnimation={dropAnimationConfig}>
                {activeDragRecipe ? (
                  <div className="p-6 bg-gradient-to-br from-blue-500 to-purple-600 text-white rounded-xl shadow-2xl border-2 border-white/20 min-w-[200px]">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <div className="font-bold text-lg">{activeDragRecipe.name}</div>
                      {activeDragRecipe.category && (
                        <CategoryEmoji category={activeDragRecipe.category as any} />
                      )}
                      {overIndex !== null && (
                        <div className="mt-2 text-sm opacity-90">
                          → {ALL_DAY_NAMES[overIndex]}
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
