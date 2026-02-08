"use client";
export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import { trpc } from "../../lib/trpcClient";
import { Input } from "@repo/ui";

import { RecipeFormDialog } from "./components/RecipeFormDialog";
import { RecipeViewDialog } from "./components/RecipeViewDialog";
import { RecipeCard } from "./components/RecipeCard";
import { STEP_DESCRIPTIONS, STEP_TITLES } from "./constants";
import type { RecipeListItem } from "./types";
import { useRecipeDialogState } from "./hooks/useRecipeDialogState";

type RecipeIngredientSummary = RecipeListItem["ingredients"] extends Array<infer R> ? R : never;

export default function RecipesPage() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = trpc.recipe.list.useQuery({
    page,
    pageSize: 200,
    search: undefined,
    category: undefined,
  });

  const allItems = useMemo<RecipeListItem[]>(() => {
    const items = data?.items ?? [];
    return items as RecipeListItem[];
  }, [data]);

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
    recipes: allItems,
    stepTitles: STEP_TITLES,
    onCreateSuccess: async () => {
      setPage(1);
      await utils.recipe.list.invalidate().catch(() => undefined);
    },
    onUpdateSuccess: async () => {
      await utils.recipe.list.invalidate().catch(() => undefined);
    },
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return allItems;
    return allItems.filter((recipe) => {
      const ingredientText = (recipe.ingredients ?? [])
        .map((ri: RecipeIngredientSummary | undefined) => ri?.name ?? "")
        .join(" ");
      const hay = `${recipe.name} ${recipe.category ?? ""} ${recipe.description ?? ""} ${ingredientText}`.toLowerCase();
      return hay.includes(term);
    });
  }, [allItems, search]);

  return (
    <div className="space-y-6">
      <h1 className="hidden text-xl font-bold text-center md:block">Oppskrifter</h1>
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
          onSubmit={submitRecipe}
          createIsPending={createIsPending}
          updateIsPending={updateIsPending}
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
      </div>

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
    </div>
  );
}
