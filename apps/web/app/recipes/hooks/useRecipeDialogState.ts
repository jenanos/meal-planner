"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { trpc } from "../../../lib/trpcClient";
import { CATEGORIES } from "../constants";
import type { FormIngredient, IngredientSuggestion, RecipeListItem } from "../types";

type RecipeIngredient = {
  ingredientId?: string;
  id?: string;
  name: string;
  unit?: string;
  quantity?: string | number;
  notes?: string;
  isPantryItem?: boolean;
};

type MaybePromise<T> = T | Promise<T>;

export interface UseRecipeDialogStateOptions {
  recipes: readonly RecipeListItem[];
  onCreateSuccess?: () => MaybePromise<void>;
  onUpdateSuccess?: () => MaybePromise<void>;
}

export type RecipeDialogState = ReturnType<typeof useRecipeDialogState>;

export function useRecipeDialogState({
  recipes,
  onCreateSuccess,
  onUpdateSuccess,
}: UseRecipeDialogStateOptions) {
  const utils = trpc.useUtils();
  const defaultCategory = CATEGORIES[0];

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [viewRecipeId, setViewRecipeId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  // The form as it was when the sheet opened, to tell whether it was edited.
  const [baseline, setBaseline] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>(defaultCategory);
  const [everyday, setEveryday] = useState(3);
  const [health, setHealth] = useState(4);
  // Kept as text so the field can be left empty ("not stated").
  const [servings, setServings] = useState("");
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
    setServings("");
    setIngSearch("");
    setDebouncedIngSearch("");
    setIngList([]);
  }, [defaultCategory]);

  const handleFormOpenChange = useCallback(
    (open: boolean) => {
      // The fields are left as they are on close, so the sheet does not blank
      // out while it animates away; opening always fills them afresh.
      setIsEditDialogOpen(open);
    },
    []
  );

  const handleViewOpenChange = useCallback((open: boolean) => {
    setIsViewDialogOpen(open);
    if (!open) {
      setViewRecipeId(null);
    }
  }, []);

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
          : [
            ...prev,
            {
              id: newIng.id,
              name: newIng.name,
              unit: newIng.unit ?? undefined,
              isPantryItem: newIng.isPantryItem,
            },
          ]
      );
      setIngSearch("");
      setDebouncedIngSearch("");
    },
  });

  const updateIngredient = trpc.ingredient.update.useMutation({
    onSuccess: () => {
      utils.ingredient.list.invalidate().catch(() => undefined);
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
  const debouncedIngKey = debouncedIngSearch.trim().toLowerCase();
  const searchIsDebouncing = debouncedIngKey !== normalizedIngKey;

  const ingredientSuggestions = useMemo(() => {
    if (!trimmedIngSearch) return [] as IngredientSuggestion[];
    // While the debounce is still catching up, `ingredientData` belongs to the
    // previous search term, so prefer a cached result for the term on screen.
    if (searchIsDebouncing) {
      return ingredientSuggestionCache[normalizedIngKey] ?? ingredientData ?? [];
    }
    return ingredientData ?? ingredientSuggestionCache[normalizedIngKey] ?? [];
  }, [
    ingredientData,
    ingredientSuggestionCache,
    normalizedIngKey,
    searchIsDebouncing,
    trimmedIngSearch,
  ]);

  /**
   * Whether `ingredientSuggestions` is known to describe the search term currently
   * on screen. Creating an ingredient off stale results can silently overwrite an
   * existing one via the upsert in `ingredient.create`, so callers must not offer
   * the "create" path until this is true.
   */
  const ingredientResultsAreCurrent =
    trimmedIngSearch.length > 0 &&
    (Boolean(ingredientSuggestionCache[normalizedIngKey]) ||
      (!searchIsDebouncing && !ingredientQuery.isFetching && ingredientData !== undefined));

  const knownIngredientNames = useMemo(() => {
    const set = new Set<string>();
    Object.values(ingredientSuggestionCache).forEach((list) => {
      list.forEach((ing) => set.add(ing.name.toLowerCase()));
    });
    ingredientData?.forEach((ing) => set.add(ing.name.toLowerCase()));
    return set;
  }, [ingredientSuggestionCache, ingredientData]);

  const addIngredientByName = useCallback(
    (rawName: string, unit?: string, id?: string) => {
      const trimmed = rawName.trim();
      if (!trimmed) return;
      const lowered = trimmed.toLowerCase();
      setIngSearch("");
      setDebouncedIngSearch("");
      if (ingList.some((item) => item.name.toLowerCase() === lowered)) return;

      // An explicit id means the caller picked an existing suggestion; otherwise fall
      // back to the names we have seen in search results. Only an exact name match
      // counts as existing — a partial match such as "aspargesbønner" for "asparges"
      // must still create the new ingredient.
      const existsInDb = Boolean(id) || knownIngredientNames.has(lowered);
      if (existsInDb) {
        setIngList((prev) =>
          prev.some((item) => item.name.toLowerCase() === lowered)
            ? prev
            : [...prev, { id, name: trimmed, unit }]
        );
        return;
      }
      if (!createIngredient.isPending) {
        createIngredient.mutate({ name: trimmed });
      }
    },
    [createIngredient, ingList, knownIngredientNames]
  );

  const removeIngredient = useCallback((nameToRemove: string) => {
    setIngList((prev) => prev.filter((item) => item.name.toLowerCase() !== nameToRemove.toLowerCase()));
  }, []);

  const upsertQuantity = useCallback((nameToUpdate: string, qty: string) => {
    setIngList((prev) => prev.map((item) => (item.name === nameToUpdate ? { ...item, quantity: qty } : item)));
  }, []);

  const upsertUnit = useCallback((nameToUpdate: string, newUnit: string) => {
    setIngList((prev) =>
      prev.map((item) => {
        if (item.name === nameToUpdate) {
          return { ...item, unit: newUnit };
        }
        return item;
      })
    );
  }, []);

  const persistUnit = useCallback(
    (nameToUpdate: string) => {
      const item = ingList.find((i) => i.name === nameToUpdate);
      if (!item) return;

      const trimmedUnit = item.unit?.trim() || undefined;
      // Use explicit ID or fallback to ingredientId (common in some hydrated states)
      const effectiveId = item.id ?? (item as any).ingredientId;

      if (effectiveId && typeof updateIngredient.mutate === "function") {
        updateIngredient.mutate({
          id: effectiveId,
          name: item.name,
          unit: trimmedUnit,
          // Preserve pantry status if known, otherwise backend defaults (which we patched to be safe)
          ...(item.isPantryItem !== undefined ? { isPantryItem: item.isPantryItem } : {}),
        });
      }
    },
    [ingList, updateIngredient]
  );

  const snapshot = JSON.stringify([
    name,
    desc,
    cat,
    everyday,
    health,
    servings,
    ingList.map((item) => [item.name, item.quantity ?? "", item.unit ?? ""]),
  ]);

  // Opening (or hydrating) sets every field in one batch, so the first render
  // with the sheet open holds the untouched form.
  useEffect(() => {
    setBaseline(isEditDialogOpen ? snapshot : null);
  }, [isEditDialogOpen, editId]);

  const isDirty = isEditDialogOpen && baseline !== null && baseline !== snapshot;

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
      setServings(recipe.servings != null ? String(recipe.servings) : "");
      const ingredients = (recipe.ingredients ?? []) as RecipeIngredient[];
      setIngList(
        ingredients.map((ingredient) => ({
          // Store both id and ingredientId to ensure we have a reference for updates
          id: ingredient.ingredientId ?? ingredient.id,
          name: ingredient.name,
          unit: ingredient.unit ?? undefined,
          quantity: ingredient.quantity ?? undefined,
          notes: ingredient.notes ?? undefined,
          isPantryItem: ingredient.isPantryItem,
        }))
      );
      setIngSearch("");
      setDebouncedIngSearch("");
      createRecipe.reset();
      updateRecipe.reset();
      setIsEditDialogOpen(true);
    },
    [defaultCategory]
  );

  const openCreate = useCallback(() => {
    resetForm();
    createRecipe.reset();
    updateRecipe.reset();
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

      const parsedServings = Number.parseInt(servings, 10);
      const servingsPayload =
        Number.isInteger(parsedServings) && parsedServings >= 1
          ? Math.min(100, parsedServings)
          : null;

      if (editId) {
        if (updateRecipe.isPending) return;
        updateRecipe.mutate({
          id: editId,
          name: trimmedName,
          description: desc || undefined,
          category: cat,
          everydayScore: everyday,
          healthScore: health,
          servings: servingsPayload,
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
        servings: servingsPayload,
        ingredients: ingredientsPayload,
      });
    },
    [cat, createRecipe, desc, editId, everyday, health, servings, ingList, name, updateRecipe]
  );

  return {
    isEditDialogOpen,
    onFormOpenChange: handleFormOpenChange,
    openCreate,
    openEdit,
    createIsPending: createRecipe.isPending,
    updateIsPending: updateRecipe.isPending,
    editId,
    isDirty,
    submitError: createRecipe.error?.message ?? updateRecipe.error?.message ?? null,
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
    servings,
    setServings,
    desc,
    setDesc,
    ingSearch,
    setIngSearch,
    trimmedIngSearch,
    ingredientSuggestions,
    ingredientResultsAreCurrent,
    isIngredientQueryFetching: ingredientQuery.isFetching || searchIsDebouncing,
    ingList,
    addIngredientByName,
    removeIngredient,
    upsertQuantity,
    upsertUnit,
    persistUnit,
    submitRecipe,
    isViewDialogOpen,
    onViewOpenChange: handleViewOpenChange,
    openView,
    viewRecipe,
    startEditFromView,
  } as const;
}
