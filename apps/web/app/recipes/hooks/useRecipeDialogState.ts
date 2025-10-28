"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import type { CarouselApi } from "@repo/ui";
import { cn } from "@repo/ui";

import { trpc } from "../../../lib/trpcClient";
import { CATEGORIES } from "../constants";
import type { FormIngredient, IngredientSuggestion, RecipeListItem } from "../types";

export const RECIPE_DIALOG_CONTENT_CLASSNAME = cn(
  "isolate z-[2000] bg-white dark:bg-neutral-900 text-foreground sm:h-[min(100vh-4rem,38rem)] sm:max-w-md sm:p-6 sm:shadow-2xl sm:ring-1 sm:ring-border sm:rounded-xl overflow-hidden",
  "max-sm:w-[calc(100vw-2rem)] max-sm:mx-auto max-sm:h-[50dvh] max-sm:max-h-[50dvh] max-sm:p-6 max-sm:bg-background max-sm:rounded-2xl max-sm:border-0 max-sm:shadow-none max-sm:!top-[calc(env(safe-area-inset-top)+1rem)] max-sm:!translate-y-0 max-sm:overflow-hidden max-sm:touch-pan-y"
);

type RecipeIngredient = RecipeListItem["ingredients"] extends Array<infer R> ? R : never;

type MaybePromise<T> = T | Promise<T>;

export interface UseRecipeDialogStateOptions {
  recipes: readonly RecipeListItem[];
  stepTitles: readonly string[];
  onCreateSuccess?: () => MaybePromise<void>;
  onUpdateSuccess?: () => MaybePromise<void>;
  hideTrigger?: boolean;
}

export function useRecipeDialogState({
  recipes,
  stepTitles,
  onCreateSuccess,
  onUpdateSuccess,
  hideTrigger = false,
}: UseRecipeDialogStateOptions) {
  const utils = trpc.useUtils();
  const defaultCategory = CATEGORIES[0];

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [viewRecipeId, setViewRecipeId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
  const [viewCarouselApi, setViewCarouselApi] = useState<CarouselApi | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [viewCurrentStep, setViewCurrentStep] = useState(0);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>(defaultCategory);
  const [everyday, setEveryday] = useState(3);
  const [health, setHealth] = useState(4);
  const [ingSearch, setIngSearch] = useState("");
  const [debouncedIngSearch, setDebouncedIngSearch] = useState("");
  const [ingList, setIngList] = useState<FormIngredient[]>([]);
  const [ingredientSuggestionCache, setIngredientSuggestionCache] = useState<
    Record<string, IngredientSuggestion[]>
  >({});

  const resetForm = useCallback(() => {
    setEditId(null);
    setName("");
    setDesc("");
    setCat(defaultCategory);
    setEveryday(3);
    setHealth(4);
    setIngSearch("");
    setDebouncedIngSearch("");
    setIngList([]);
  }, [defaultCategory]);

  const handleFormOpenChange = useCallback(
    (open: boolean) => {
      setIsEditDialogOpen(open);
      if (!open) {
        resetForm();
        setCurrentStep(0);
      }
    },
    [resetForm]
  );

  const handleViewOpenChange = useCallback((open: boolean) => {
    setIsViewDialogOpen(open);
    if (!open) {
      setViewRecipeId(null);
      setViewCurrentStep(0);
    }
  }, []);

  const ingredientQuery = trpc.ingredient.list.useQuery(
    { search: debouncedIngSearch.trim() || undefined },
    { enabled: ingSearch.trim().length > 0, staleTime: 5_000 }
  );
  const ingredientData = ingredientQuery.data as IngredientSuggestion[] | undefined;

  const createIngredient = trpc.ingredient.create.useMutation({
    onSuccess: (newIng: IngredientSuggestion) => {
      utils.ingredient.list.invalidate().catch(() => undefined);
      setIngList((prev) =>
        prev.some((item) => item.name.toLowerCase() === newIng.name.toLowerCase())
          ? prev
          : [...prev, { name: newIng.name, unit: newIng.unit ?? undefined }]
      );
      setIngSearch("");
      setDebouncedIngSearch("");
    },
  });

  const createRecipe = trpc.recipe.create.useMutation({
    onSuccess: async () => {
      handleFormOpenChange(false);
      try {
        await onCreateSuccess?.();
      } catch (error) {
        console.error("Failed to run onCreateSuccess callback", error);
      }
    },
  });

  const updateRecipe = trpc.recipe.update.useMutation({
    onSuccess: async () => {
      handleFormOpenChange(false);
      try {
        await onUpdateSuccess?.();
      } catch (error) {
        console.error("Failed to run onUpdateSuccess callback", error);
      }
    },
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedIngSearch(ingSearch), 250);
    return () => clearTimeout(timer);
  }, [ingSearch]);

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

  const trimmedIngSearch = ingSearch.trim();
  const normalizedIngKey = trimmedIngSearch.toLowerCase();

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
    setIngList((prev) => prev.map((item) => (item.name === nameToUpdate ? { ...item, quantity: qty } : item)));
  }, []);

  const numberFormatter = useMemo(
    () => new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }),
    []
  );

  const formatIngredientLine = useCallback(
    (ingredient: {
      name: string;
      quantity?: number | string | null;
      unit?: string | null;
      notes?: string | null;
    }) => {
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

  const matchingRecipes = useMemo(() => {
    const term = name.trim().toLowerCase();
    if (!term || editId) return [] as RecipeListItem[];
    return recipes
      .filter((recipe) => recipe.name.toLowerCase().includes(term))
      .slice(0, 8);
  }, [recipes, name, editId]);

  const viewRecipe = useMemo(() => {
    if (!viewRecipeId) return null;
    return recipes.find((recipe) => recipe.id === viewRecipeId) ?? null;
  }, [recipes, viewRecipeId]);

  const hydrateForm = useCallback(
    (recipe: RecipeListItem) => {
      setEditId(recipe.id);
      setName(recipe.name ?? "");
      setDesc(recipe.description ?? "");
      const categoryValue = (CATEGORIES as readonly string[]).includes((recipe.category ?? "") as string)
        ? (recipe.category as (typeof CATEGORIES)[number])
        : defaultCategory;
      setCat(categoryValue);
      setEveryday(recipe.everydayScore ?? 3);
      setHealth(recipe.healthScore ?? 4);
      const ingredients = (recipe.ingredients ?? []) as RecipeIngredient[];
      setIngList(
        ingredients.map((ingredient) => ({
          name: ingredient.name,
          unit: ingredient.unit ?? undefined,
          quantity: ingredient.quantity ?? undefined,
          notes: ingredient.notes ?? undefined,
        }))
      );
      setIngSearch("");
      setDebouncedIngSearch("");
      setIsEditDialogOpen(true);
    },
    [defaultCategory]
  );

  const openCreate = useCallback(() => {
    resetForm();
    setIsEditDialogOpen(true);
  }, [resetForm]);

  const openEdit = useCallback(
    (id: string) => {
      const target = recipes.find((recipe) => recipe.id === id);
      if (!target) return;
      hydrateForm(target);
    },
    [recipes, hydrateForm]
  );

  const openView = useCallback((id: string) => {
    setViewRecipeId(id);
    setIsViewDialogOpen(true);
  }, []);

  const onSelectExistingRecipe = useCallback(
    (id: string) => {
      handleFormOpenChange(false);
      setViewRecipeId(id);
      setIsViewDialogOpen(true);
    },
    [handleFormOpenChange]
  );

  const startEditFromView = useCallback(
    (id: string) => {
      const target = recipes.find((recipe) => recipe.id === id);
      if (!target) return;
      handleViewOpenChange(false);
      hydrateForm(target);
    },
    [recipes, hydrateForm, handleViewOpenChange]
  );

  const submitRecipe = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
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
            : ingredient.quantity ?? undefined,
        notes: ingredient.notes,
      }));

      if (editId) {
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
        return;
      }

      if (createRecipe.isPending) return;
      createRecipe.mutate({
        name: trimmedName,
        description: desc || undefined,
        category: cat,
        everydayScore: everyday,
        healthScore: health,
        ingredients: ingredientsPayload,
      });
    },
    [cat, createRecipe, desc, editId, everyday, health, ingList, name, updateRecipe]
  );

  const isLastStep = currentStep === stepTitles.length - 1;
  const nextDisabled = currentStep === 0 && name.trim().length === 0;
  const nextLabel = !isLastStep ? `Neste: ${stepTitles[currentStep + 1]}` : null;

  return {
    dialogContentClassName: RECIPE_DIALOG_CONTENT_CLASSNAME,
    hideTrigger,
    isEditDialogOpen,
    onFormOpenChange: handleFormOpenChange,
    openCreate,
    openEdit,
    createIsPending: createRecipe.isPending,
    updateIsPending: updateRecipe.isPending,
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
    isIngredientQueryFetching: ingredientQuery.isFetching,
    ingList,
    addIngredientByName,
    removeIngredient,
    upsertQuantity,
    submitRecipe,
    isViewDialogOpen,
    onViewOpenChange: handleViewOpenChange,
    openView,
    viewRecipe,
    viewCurrentStep,
    viewCarouselApi,
    setViewCarouselApi,
    formatIngredientLine,
    startEditFromView,
  } as const;
}
