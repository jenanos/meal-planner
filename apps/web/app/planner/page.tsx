"use client";
/* eslint-disable no-undef */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { trpc } from "../../lib/trpcClient";
import { WeekSlot } from "./components/WeekSlot";
import { WeekSelector } from "./components/WeekSelector";
import { SuggestionSection } from "./components/SuggestionSection";
import { SearchSection } from "./components/SearchSection";
import { MobileEditor } from "./components/MobileEditor";
import { CategoryEmoji } from "../components/CategoryEmoji";
import { startOfWeekISO, deriveWeekLabel } from "../../lib/week";
import { cn, type CarouselApi } from "@repo/ui";
import { RecipeViewDialog } from "../recipes/components/RecipeViewDialog";
import { RecipeFormDialog } from "../recipes/components/RecipeFormDialog";
import { STEP_DESCRIPTIONS, STEP_TITLES, CATEGORIES } from "../recipes/constants";
import type { RecipeListItem, FormIngredient, IngredientSuggestion } from "../recipes/types";

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
import type { MockWeekTimelineResult } from "../../lib/mock/store";
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
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [viewRecipeId, setViewRecipeId] = useState<string | null>(null);
  const [viewCurrentStep, setViewCurrentStep] = useState(0);
  const [viewCarouselApi, setViewCarouselApi] = useState<CarouselApi | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>(CATEGORIES[0]);
  const [everyday, setEveryday] = useState(3);
  const [health, setHealth] = useState(4);
  const [ingSearch, setIngSearch] = useState("");
  const [debouncedIngSearch, setDebouncedIngSearch] = useState("");
  const [ingList, setIngList] = useState<FormIngredient[]>([]);
  const [ingredientSuggestionCache, setIngredientSuggestionCache] = useState<
    Record<string, IngredientSuggestion[]>
  >({});

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
  const ingredientQuery = trpc.ingredient.list.useQuery(
    { search: debouncedIngSearch.trim() || undefined },
    { enabled: ingSearch.trim().length > 0, staleTime: 5_000 }
  );
  const ingredientData = ingredientQuery.data as IngredientSuggestion[] | undefined;
  const createIngredient = trpc.ingredient.create.useMutation({
    onSuccess: (newIng) => {
      utils.ingredient.list.invalidate().catch(() => undefined);
      setIngList((prev) =>
        prev.some((item) => item.name.toLowerCase() === newIng.name.toLowerCase())
          ? prev
          : [...prev, { name: newIng.name, unit: newIng.unit }]
      );
      setIngSearch("");
      setDebouncedIngSearch("");
    },
  });
  const updateRecipe = trpc.recipe.update.useMutation({
    onSuccess: async () => {
      await utils.recipe.list.invalidate().catch(() => undefined);
      await utils.planner.getWeekPlan.invalidate({ weekStart: activeWeekStart }).catch(() => undefined);
      await weekPlanQuery.refetch().catch(() => undefined);
      setIsEditDialogOpen(false);
      resetForm();
    },
  });

  const trimmedIngSearch = ingSearch.trim();
  const normalizedIngKey = trimmedIngSearch.toLowerCase();

  useEffect(() => {
    if (!ingredientData) return;
    const key = debouncedIngSearch.trim().toLowerCase();
    if (!key) return;
    setIngredientSuggestionCache((prev) => {
      if (prev[key] === ingredientData) {
        return prev;
      }
      return { ...prev, [key]: ingredientData };
    });
  }, [debouncedIngSearch, ingredientData]);

  const ingredientSuggestions = useMemo(() => {
    if (!trimmedIngSearch) return [] as IngredientSuggestion[];
    return ingredientData ?? ingredientSuggestionCache[normalizedIngKey] ?? [];
  }, [ingredientData, ingredientSuggestionCache, normalizedIngKey, trimmedIngSearch]);

  const knownIngredientNames = useMemo(() => {
    const set = new Set<string>();
    Object.values(ingredientSuggestionCache).forEach((list) => {
      list.forEach((ing) => set.add(ing.name.toLowerCase()));
    });
    ingredientData?.forEach((ing) => set.add(ing.name.toLowerCase()));
    return set;
  }, [ingredientSuggestionCache, ingredientData]);

  const addIngredientByName = useCallback(
    (rawName: string, unit?: string) => {
      const trimmed = rawName.trim();
      if (!trimmed) return;
      setIngList((prev) => {
        if (prev.some((item) => item.name.toLowerCase() === trimmed.toLowerCase())) {
          return prev;
        }
        const existsInDb = knownIngredientNames.has(trimmed.toLowerCase());
        if (existsInDb) {
          return [...prev, { name: trimmed, unit }];
        }
        if (!createIngredient.isPending) {
          createIngredient.mutate({ name: trimmed });
        }
        return prev;
      });
      setIngSearch("");
      setDebouncedIngSearch("");
    },
    [createIngredient, knownIngredientNames]
  );

  const removeIngredient = useCallback((nameToRemove: string) => {
    setIngList((prev) => prev.filter((item) => item.name.toLowerCase() !== nameToRemove.toLowerCase()));
  }, []);

  const upsertQuantity = useCallback((nameToUpdate: string, qty: string) => {
    setIngList((prev) =>
      prev.map((item) => (item.name === nameToUpdate ? { ...item, quantity: qty } : item))
    );
  }, []);

  const numberFormatter = useMemo(
    () => new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }),
    []
  );

  const formatIngredientLine = useCallback(
    (ingredient: { name: string; quantity?: number | string; unit?: string; notes?: string }) => {
      const parts: string[] = [];
      if (ingredient.quantity != null && ingredient.quantity !== "") {
        if (typeof ingredient.quantity === "number") {
          parts.push(numberFormatter.format(ingredient.quantity));
        } else {
          parts.push(String(ingredient.quantity));
        }
      }
      if (ingredient.unit) {
        parts.push(ingredient.unit);
      }
      parts.push(ingredient.name);
      if (ingredient.notes) {
        parts.push(`(${ingredient.notes})`);
      }
      return parts.join(" ");
    },
    [numberFormatter]
  );

  const dialogContentClassName = useMemo(
    () =>
      cn(
        "isolate z-[2000] bg-white dark:bg-neutral-900 text-foreground sm:h-[min(100vh-4rem,38rem)] sm:max-w-md sm:p-6 sm:shadow-2xl sm:ring-1 sm:ring-border sm:rounded-xl overflow-hidden",
        "max-sm:w-[calc(100vw-2rem)] max-sm:mx-auto max-sm:h-[50dvh] max-sm:max-h-[50dvh] max-sm:p-6 max-sm:bg-background max-sm:rounded-2xl max-sm:border-0 max-sm:shadow-none max-sm:!top-[calc(env(safe-area-inset-top)+1rem)] max-sm:!translate-y-0 max-sm:overflow-hidden max-sm:touch-pan-y"
      ),
    []
  );

  const resetForm = useCallback(() => {
    setEditId(null);
    setName("");
    setDesc("");
    setCat(CATEGORIES[0]);
    setEveryday(3);
    setHealth(4);
    setIngSearch("");
    setDebouncedIngSearch("");
    setIngList([]);
  }, []);

  const hydrateForm = useCallback(
    (recipe: RecipeDTO | null) => {
      if (!recipe) return;
      setEditId(recipe.id);
      setName(recipe.name ?? "");
      setDesc(recipe.description ?? "");
      const catValue = (CATEGORIES as readonly string[]).includes((recipe.category ?? "") as string)
        ? (recipe.category as (typeof CATEGORIES)[number])
        : CATEGORIES[0];
      setCat(catValue);
      setEveryday(recipe.everydayScore ?? 3);
      setHealth(recipe.healthScore ?? 4);
      setIngList(
        (recipe.ingredients ?? []).map((ingredient: any) => ({
          name: ingredient.name,
          unit: ingredient.unit ?? undefined,
          quantity: ingredient.quantity ?? undefined,
          notes: ingredient.notes ?? undefined,
        }))
      );
      setIngSearch("");
      setDebouncedIngSearch("");
    },
    []
  );

  const submitRecipe = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!editId) return;
      const trimmedName = name.trim();
      if (!trimmedName) return;
      const ingredientsPayload = ingList.map((ingredient) => ({
        name: ingredient.name,
        unit: ingredient.unit,
        quantity:
          typeof ingredient.quantity === "string"
            ? ingredient.quantity.trim() === ""
              ? undefined
              : Number.isNaN(Number(ingredient.quantity))
                ? ingredient.quantity
                : Number(ingredient.quantity)
            : ingredient.quantity,
        notes: ingredient.notes,
      }));

      if (updateRecipe.isPending) return;
      updateRecipe.mutate({
        id: editId,
        name: trimmedName,
        description: desc || undefined,
        category: cat,
        everydayScore: everyday,
        healthScore: health,
        ingredients: ingredientsPayload,
      });
    },
    [cat, desc, editId, everyday, health, ingList, name, updateRecipe]
  );

  const isLastStep = currentStep === STEP_TITLES.length - 1;
  const nextDisabled = currentStep === 0 && name.trim().length === 0;
  const nextLabel = !isLastStep ? `Neste: ${STEP_TITLES[currentStep + 1]}` : null;

  const selectedIds = useMemo(
    () => week.filter((recipe): recipe is RecipeDTO => Boolean(recipe)).map((recipe) => recipe.id),
    [week]
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const recipeById = useMemo(() => {
    const map = new Map<string, RecipeDTO>();
    week.forEach((recipe) => {
      if (recipe) map.set(recipe.id, recipe);
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
    return map;
  }, [week, longGap, frequent, searchResults]);

  const viewRecipe = useMemo<RecipeListItem | null>(() => {
    if (!viewRecipeId) return null;
    const recipe = recipeById.get(viewRecipeId);
    if (!recipe) return null;
    return recipe as unknown as RecipeListItem;
  }, [viewRecipeId, recipeById]);

  const handleRecipeClick = useCallback((recipe: RecipeDTO) => {
    setViewRecipeId(recipe.id);
    setIsViewDialogOpen(true);
  }, []);

  const startEditFromView = useCallback(
    (id: string) => {
      const recipe = recipeById.get(id) ?? null;
      if (!recipe) return;
      hydrateForm(recipe);
      setIsViewDialogOpen(false);
      setTimeout(() => {
        setIsEditDialogOpen(true);
      }, 0);
    },
    [hydrateForm, recipeById]
  );

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

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedIngSearch(ingSearch), 250);
    return () => clearTimeout(timer);
  }, [ingSearch]);

  useEffect(() => {
    if (!carouselApi) return;
    const handleSelect = () => setCurrentStep(carouselApi.selectedScrollSnap());
    const unsubscribe = carouselApi.on("select", handleSelect);
    handleSelect();
    return () => {
      unsubscribe();
    };
  }, [carouselApi]);

  useEffect(() => {
    if (isEditDialogOpen && carouselApi) {
      setCurrentStep(0);
      carouselApi.scrollTo(0);
    }
  }, [isEditDialogOpen, carouselApi]);

  useEffect(() => {
    if (!viewCarouselApi) return;
    const handleSelect = () => setViewCurrentStep(viewCarouselApi.selectedScrollSnap());
    handleSelect();
    const unsubscribe = viewCarouselApi.on("select", handleSelect);
    return () => {
      unsubscribe();
    };
  }, [viewCarouselApi]);

  useEffect(() => {
    if (isViewDialogOpen && viewCarouselApi) {
      setViewCurrentStep(0);
      viewCarouselApi.scrollTo(0);
    }
  }, [isViewDialogOpen, viewCarouselApi]);

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
  const activeDragRecipe = useMemo(() => {
    if (!activeDragPayload) return null;
    if (activeDragPayload.source === "week") return week[activeDragPayload.index];
    if (activeDragPayload.source === "longGap") return longGap[activeDragPayload.index];
    if (activeDragPayload.source === "frequent") return frequent[activeDragPayload.index];
    if (activeDragPayload.source === "search") return searchResults[activeDragPayload.index];
    return null;
  }, [activeDragPayload, week, longGap, frequent, searchResults]);

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
      <h1 className="text-xl font-bold text-center">Ukesplan</h1>

      <WeekSelector
        weeks={timelineWeeks.map((w, i) => ({ week: w, index: i }))}
        activeWeekStart={activeWeekStart}
        activeWeekIndex={activeWeekIndex}
        onSelectWeek={handleSelectWeek}
      />

      <RecipeFormDialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) {
            resetForm();
            setCurrentStep(0);
            carouselApi?.scrollTo(0);
          }
        }}
        onCreateClick={() => {}}
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
        matchingRecipes={[]}
        onSelectExistingRecipe={() => {}}
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
        isIngredientQueryFetching={ingredientQuery.isFetching}
        ingList={ingList}
        addIngredientByName={addIngredientByName}
        removeIngredient={removeIngredient}
        upsertQuantity={upsertQuantity}
        onSubmit={submitRecipe}
        createIsPending={createIngredient.isPending}
        updateIsPending={updateRecipe.isPending}
        hideTrigger
      />

      <RecipeViewDialog
        open={isViewDialogOpen}
        onOpenChange={(open) => {
          setIsViewDialogOpen(open);
          if (!open) {
            setViewRecipeId(null);
            setViewCurrentStep(0);
            viewCarouselApi?.scrollTo(0);
          }
        }}
        dialogContentClassName={dialogContentClassName}
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
            onRecipeClick={handleRecipeClick}
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
                onRecipeClick={handleRecipeClick}
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
