"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { trpc } from "../../lib/trpcClient";
import { cn, Input } from "@repo/ui";
import type { CarouselApi } from "@repo/ui";

import { RecipeFormDialog } from "./components/RecipeFormDialog";
import { RecipeViewDialog } from "./components/RecipeViewDialog";
import { RecipeCard } from "./components/RecipeCard";
import { CATEGORIES, STEP_DESCRIPTIONS, STEP_TITLES } from "./constants";
import type { FormIngredient, IngredientSuggestion, RecipeListItem } from "./types";

export default function RecipesPage() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [viewRecipeId, setViewRecipeId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
  const [viewCarouselApi, setViewCarouselApi] = useState<CarouselApi | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [viewCurrentStep, setViewCurrentStep] = useState(0);

  // Fetch a larger page to approximate "all" for client-side filtering.
  const { data, isLoading, error } = trpc.recipe.list.useQuery({
    page,
    pageSize: 200,
    search: undefined, // we'll filter client-side for live matches
    category: undefined,
  });

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("VEGETAR");
  const [everyday, setEveryday] = useState(3);
  const [health, setHealth] = useState(4);
  const [ingSearch, setIngSearch] = useState("");
  const [debouncedIngSearch, setDebouncedIngSearch] = useState("");
  const [ingList, setIngList] = useState<FormIngredient[]>([]);
  const [ingredientSuggestionCache, setIngredientSuggestionCache] = useState<
    Record<string, IngredientSuggestion[]>
  >({});

  // Ingredient autosuggest (live as you type)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedIngSearch(ingSearch), 250);
    return () => clearTimeout(t);
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

  const ingredientQuery = trpc.ingredient.list.useQuery(
    { search: debouncedIngSearch.trim() || undefined },
    { enabled: ingSearch.trim().length > 0, staleTime: 5_000 }
  );

  const trimmedIngSearch = ingSearch.trim();
  const normalizedIngKey = trimmedIngSearch.toLowerCase();

  useEffect(() => {
    if (!ingredientQuery.data) return;
    const key = debouncedIngSearch.trim().toLowerCase();
    if (!key) return;
    setIngredientSuggestionCache((prev) => {
      if (prev[key] === ingredientQuery.data) {
        return prev;
      }
      return { ...prev, [key]: ingredientQuery.data };
    });
  }, [debouncedIngSearch, ingredientQuery.data]);

  const ingredientSuggestions = useMemo(() => {
    if (!trimmedIngSearch) return [];
    return ingredientQuery.data ?? ingredientSuggestionCache[normalizedIngKey] ?? [];
  }, [ingredientQuery.data, ingredientSuggestionCache, normalizedIngKey, trimmedIngSearch]);

  const knownIngredientNames = useMemo(() => {
    const set = new Set<string>();
    Object.values(ingredientSuggestionCache).forEach((list) => {
      list.forEach((ing) => set.add(ing.name.toLowerCase()));
    });
    ingredientQuery.data?.forEach((ing) => set.add(ing.name.toLowerCase()));
    return set;
  }, [ingredientSuggestionCache, ingredientQuery.data]);

  const create = trpc.recipe.create.useMutation({
    onSuccess: () => {
      setName("");
      setDesc("");
      setIngList([]);
      // Refresh the grid
      setPage(1);
      utils.recipe.list.invalidate().catch(() => undefined);
    },
  });

  const update = trpc.recipe.update.useMutation({
    onSuccess: () => {
      utils.recipe.list.invalidate().catch(() => undefined);
    },
  });

  const createIngredient = trpc.ingredient.create.useMutation({
    onSuccess: (newIng) => {
      // refresh suggestions so it appears in the list next time
      utils.ingredient.list.invalidate().catch(() => undefined);
      // also add to current selection if not present
      setIngList((prev) => (prev.some((i) => i.name.toLowerCase() === newIng.name.toLowerCase()) ? prev : [...prev, { name: newIng.name, unit: newIng.unit }]));
      setIngSearch("");
    },
  });

  const allItems = useMemo(() => data?.items ?? [], [data]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return allItems;
    return allItems.filter((r) => {
      const ingredientText = (r.ingredients ?? [])
        .map((ri: any) => ri?.name ?? "")
        .join(" ");
      const hay = `${r.name} ${r.category ?? ""} ${r.description ?? ""} ${ingredientText}`.toLowerCase();
      return hay.includes(term);
    });
  }, [allItems, search]);

  const matchingRecipes = useMemo(() => {
    const term = name.trim().toLowerCase();
    if (!term || editId) return [];
    return allItems
      .filter((recipe) => recipe.name.toLowerCase().includes(term))
      .slice(0, 8);
  }, [allItems, name, editId]);

  const viewRecipe = useMemo(() => {
    if (!viewRecipeId) return null;
    return allItems.find((r) => r.id === viewRecipeId) ?? null;
  }, [allItems, viewRecipeId]);

  const numberFormatter = useMemo(
    () => new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }),
    []
  );

  const formatIngredientLine = (ingredient: {
    name: string;
    quantity?: number | string;
    unit?: string;
    notes?: string;
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
  };

  const dialogContentClassName = cn(
    // Core look
    "isolate z-[2000] bg-white dark:bg-neutral-900 text-foreground sm:h-[min(100vh-4rem,38rem)] sm:max-w-md sm:p-6 sm:shadow-2xl sm:ring-1 sm:ring-border sm:rounded-xl overflow-hidden",
    // Mobile: symmetric margins and consolidated padding
    "max-sm:w-[calc(100vw-2rem)] max-sm:mx-auto max-sm:h-[50dvh] max-sm:max-h-[50dvh] max-sm:p-6 max-sm:bg-background max-sm:rounded-2xl max-sm:border-0 max-sm:shadow-none max-sm:!top-[calc(env(safe-area-inset-top)+1rem)] max-sm:!translate-y-0 max-sm:overflow-hidden max-sm:touch-pan-y"
  );

  // Helpers
  const hydrateForm = (recipe: RecipeListItem | null) => {
    if (recipe) {
      setEditId(recipe.id);
      setName(recipe.name);
      setDesc(recipe.description ?? "");
      setCat((recipe.category as any) ?? "VEGETAR");
      setEveryday(recipe.everydayScore ?? 3);
      setHealth(recipe.healthScore ?? 4);
      setIngList(
        (recipe.ingredients ?? []).map((ri: any) => ({
          name: ri.name,
          unit: ri.unit ?? undefined,
          quantity: ri.quantity ?? undefined,
          notes: ri.notes ?? undefined,
        }))
      );
    } else {
      setEditId(null);
      setName("");
      setDesc("");
      setCat("VEGETAR");
      setEveryday(3);
      setHealth(4);
      setIngList([]);
    }

    setIngSearch("");
    setDebouncedIngSearch("");
    setCurrentStep(0);
    setTimeout(() => carouselApi?.scrollTo(0), 0);
    setIsEditDialogOpen(true);
  };

  const openCreate = () => {
    hydrateForm(null);
  };

  const openEdit = (id: string) => {
    const item = allItems.find((r) => r.id === id);
    if (!item) return;
    hydrateForm(item);
  };

  const openView = (id: string) => {
    setViewRecipeId(id);
    setIsViewDialogOpen(true);
  };

  const handleSelectExistingRecipe = (id: string) => {
    setIsEditDialogOpen(false);
    setTimeout(() => {
      openView(id);
    }, 0);
  };

  const startEditFromView = (id: string) => {
    setIsViewDialogOpen(false);
    setTimeout(() => {
      openEdit(id);
    }, 0);
  };

  const addIngredientByName = (name: string, unit?: string) => {
    const n = name.trim();
    if (!n) return;
    if (!ingList.some((i) => i.name.toLowerCase() === n.toLowerCase())) {
      // If this name exists in current suggestions, just add locally.
      const existsInDb = knownIngredientNames.has(n.toLowerCase());
      if (existsInDb) {
        setIngList((prev) => [...prev, { name: n, unit }]);
        setIngSearch("");
      } else {
        // Create in DB first to avoid duplicates and ensure consistency
        if (!createIngredient.isPending) {
          createIngredient.mutate({ name: n });
        }
      }
    } else {
      setIngSearch("");
    }
  };

  const removeIngredient = (name: string) => {
    setIngList((prev) => prev.filter((x) => x.name.toLowerCase() !== name.toLowerCase()));
  };

  const upsertQuantity = (name: string, qty: string) => {
    setIngList((prev) => prev.map((i) => (i.name === name ? { ...i, quantity: qty } : i)));
  };

  const submitRecipe = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name) return;
    const ingredientsPayload = ingList.map((i) => ({
      name: i.name,
      unit: i.unit,
      quantity: typeof i.quantity === "string" && i.quantity.trim() === "" ? undefined : (isNaN(Number(i.quantity)) ? i.quantity : Number(i.quantity)),
      notes: i.notes,
    }));

    if (editId) {
      if (update.isPending) return;
      update.mutate(
        {
          id: editId,
          name,
          description: desc || undefined,
          category: cat,
          everydayScore: everyday,
          healthScore: health,
          ingredients: ingredientsPayload,
        },
        { onSuccess: () => setIsEditDialogOpen(false) }
      );
    } else {
      if (create.isPending) return;
      create.mutate(
        {
          name,
          description: desc || undefined,
          category: cat,
          everydayScore: everyday,
          healthScore: health,
          ingredients: ingredientsPayload,
        },
        { onSuccess: () => setIsEditDialogOpen(false) }
      );
    }
  };

  const isLastStep = currentStep === STEP_TITLES.length - 1;
  const nextDisabled = currentStep === 0 && name.trim().length === 0;
  const nextLabel = !isLastStep ? `Neste: ${STEP_TITLES[currentStep + 1]}` : null;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-center">Oppskrifter</h1>
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 max-w-md">
          <Input
            placeholder="Søk etter oppskrifter"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {isLoading ? (
            <p className="mt-1 text-xs text-muted-foreground">Laster…</p>
          ) : null}
          {error ? (
            <p className="mt-1 text-xs text-red-500">Kunne ikke laste</p>
          ) : null}
        </div>

        <RecipeFormDialog
          open={isEditDialogOpen}
          onOpenChange={(open) => {
            setIsEditDialogOpen(open);
            if (!open) {
              setEditId(null);
              setCurrentStep(0);
              setIngSearch("");
              setDebouncedIngSearch("");
            }
          }}
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
          onSelectExistingRecipe={handleSelectExistingRecipe}
          cat={cat}
          onCategoryChange={(value) => setCat(value)}
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
          createIsPending={create.isPending}
          updateIsPending={update.isPending}
        />

        <RecipeViewDialog
          open={isViewDialogOpen}
          onOpenChange={(open) => {
            setIsViewDialogOpen(open);
            if (!open) {
              setViewRecipeId(null);
              setViewCurrentStep(0);
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
      </div>

      {/* 7-wide responsive grid like planner */}
      <div className="overflow-x-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 justify-items-center xl:min-w-[840px]">
          {filtered.map((r: RecipeListItem, idx) => (
            <RecipeCard
              key={r.id}
              recipe={{ id: r.id, name: r.name, category: r.category }}
              index={idx}
              onClick={() => openView(r.id)}
            />
          ))}
        </div>
      </div>

      {/* Dialogen over inneholder skjema for å legge til ny oppskrift */}
    </div>
  );
}
