"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "../../lib/trpcClient";
import {
  Badge,
  Button,
  Carousel,
  CarouselContent,
  CarouselItem,
  cn,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@repo/ui";
import type { CarouselApi } from "@repo/ui";
import { X } from "lucide-react";
import { EVERYDAY_LABELS, HEALTH_LABELS } from "../../lib/scoreLabels";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";
import { RecipeCard } from "./components/RecipeCard";

const CATEGORIES = ["FISK", "VEGETAR", "KYLLING", "STORFE", "ANNET"] as const;
const STEP_TITLES = ["Navn", "Detaljer", "Ingredienser", "Beskrivelse"] as const;
const STEP_DESCRIPTIONS = [
  "Gi oppskriften et navn eller velg en eksisterende.",
  "Velg kategori og scorer.",
  "Finn og legg til ingredienser.",
  "Fortell kort om oppskriften.",
] as const;

type RecipeListItem = inferRouterOutputs<AppRouter>["recipe"]["list"]["items"][number];
type IngredientSuggestion = inferRouterOutputs<AppRouter>["ingredient"]["list"][number];

export default function RecipesPage() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [viewRecipeId, setViewRecipeId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
  const [currentStep, setCurrentStep] = useState(0);

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
  type FormIngredient = { name: string; unit?: string; quantity?: string | number; notes?: string };
  const [ingSearch, setIngSearch] = useState("");
  const [debouncedIngSearch, setDebouncedIngSearch] = useState("");
  const [ingList, setIngList] = useState<Array<FormIngredient>>([]);
  const [ingredientSuggestions, setIngredientSuggestions] = useState<IngredientSuggestion[]>([]);

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

  const ingredientQuery = trpc.ingredient.list.useQuery(
    { search: debouncedIngSearch.trim() || undefined },
    { enabled: ingSearch.trim().length > 0, staleTime: 5_000, keepPreviousData: true }
  );

  useEffect(() => {
    if (!ingSearch.trim()) {
      setIngredientSuggestions([]);
      return;
    }
    if (ingredientQuery.data) {
      setIngredientSuggestions(ingredientQuery.data);
    }
  }, [ingSearch, ingredientQuery.data]);

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

  const trimmedIngSearch = ingSearch.trim();
  const dialogContentClassName = cn(
    "dialog-content-responsive isolate z-[2000] bg-white dark:bg-neutral-900 text-foreground sm:max-h-[min(100vh-4rem,38rem)] sm:p-6 sm:shadow-2xl sm:ring-1 sm:ring-border sm:rounded-xl",
    "max-sm:bg-background max-sm:!left-0 max-sm:!top-0 max-sm:!h-[100dvh] max-sm:!max-h-none max-sm:!w-full max-sm:!max-w-none max-sm:!translate-x-0 max-sm:!translate-y-0 max-sm:!rounded-none max-sm:!border-0 max-sm:!p-0 max-sm:!shadow-none max-sm:overflow-hidden"
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
    setIngredientSuggestions([]);
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
      const existsInDb = ingredientSuggestions.some((i) => i.name.toLowerCase() === n.toLowerCase());
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

  const submitRecipe = (e: React.FormEvent) => {
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

        <Dialog
          open={isEditDialogOpen}
          onOpenChange={(open) => {
            setIsEditDialogOpen(open);
            if (!open) {
              setEditId(null);
              setCurrentStep(0);
              setIngSearch("");
              setDebouncedIngSearch("");
              setIngredientSuggestions([]);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="min-w-[12rem]"
              onClick={(e) => {
                e.preventDefault();
                openCreate();
              }}
              type="button"
            >
              Legg til oppskrift
            </Button>
          </DialogTrigger>
          <DialogContent className={dialogContentClassName}>
            <div className="flex h-full flex-col max-sm:pt-[env(safe-area-inset-top)] max-sm:pb-[env(safe-area-inset-bottom)]">
              <DialogHeader className="text-center sm:text-left max-sm:px-6 max-sm:pt-6 sm:px-0 sm:pt-0">
                <DialogTitle>{editId ? "Rediger oppskrift" : "Ny oppskrift"}</DialogTitle>
                <DialogDescription>
                  {editId
                    ? "Gjør endringer og lagre for å oppdatere oppskriften."
                    : "Fyll ut feltene under og lagre for å legge til oppskriften."}
                </DialogDescription>
              </DialogHeader>

              <form className="flex flex-1 flex-col gap-5 max-sm:overflow-hidden" onSubmit={submitRecipe}>
                <div className="space-y-5 max-sm:flex-1 max-sm:overflow-y-auto max-sm:px-6 sm:space-y-5">
                  <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Steg {currentStep + 1} av {STEP_TITLES.length}
                        </p>
                        <p className="text-xs text-muted-foreground">{STEP_DESCRIPTIONS[currentStep]}</p>
                      </div>
                      <div className="flex items-center gap-1.5" aria-hidden="true">
                        {STEP_TITLES.map((_, idx) => (
                          <span
                            key={idx}
                            className={cn(
                              "h-1.5 w-6 rounded-full transition-colors",
                              idx <= currentStep ? "bg-primary" : "bg-muted-foreground/30"
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <Carousel className="w-full" setApi={setCarouselApi} opts={{ loop: false }}>
                    <CarouselContent>
                      <CarouselItem className="space-y-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-sm font-medium">Navn</label>
                          <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            autoFocus={!editId}
                          />
                          {!editId ? (
                            <p className="text-xs text-muted-foreground">
                              Søk etter eksisterende oppskrifter mens du skriver.
                            </p>
                          ) : null}
                        </div>
                        {!editId && matchingRecipes.length > 0 ? (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Finnes fra før
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {matchingRecipes.map((recipe) => (
                                <Badge
                                  key={recipe.id}
                                  className="cursor-pointer"
                                  onClick={() => handleSelectExistingRecipe(recipe.id)}
                                >
                                  {recipe.name}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </CarouselItem>

                      <CarouselItem className="space-y-4">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="flex flex-col gap-1.5 sm:col-span-2">
                            <label className="text-sm font-medium">Kategori</label>
                            <Select value={cat} onValueChange={(v) => setCat(v as any)}>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Velg kategori" />
                              </SelectTrigger>
                              <SelectContent>
                                {CATEGORIES.map((c) => (
                                  <SelectItem key={c} value={c}>
                                    {c}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-medium">Helgescore</label>
                            <Select value={String(everyday)} onValueChange={(v) => setEveryday(parseInt(v, 10))}>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Velg nivå" />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(EVERYDAY_LABELS).map(([score, label]) => (
                                  <SelectItem key={score} value={score}>
                                    {label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-medium">Helsescore</label>
                            <Select value={String(health)} onValueChange={(v) => setHealth(parseInt(v, 10))}>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Velg nivå" />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(HEALTH_LABELS).map(([score, label]) => (
                                  <SelectItem key={score} value={score}>
                                    {label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </CarouselItem>

                      <CarouselItem className="space-y-4">
                        <div className="space-y-3">
                          <label className="text-sm font-medium">Ingredienser</label>
                          <Input
                            value={ingSearch}
                            onChange={(e) => setIngSearch(e.target.value)}
                            placeholder="Søk etter ingrediens"
                          />
                          {trimmedIngSearch.length > 0 ? (
                            <div className="space-y-2">
                              {ingredientQuery.isFetching ? (
                                <p className="text-xs text-muted-foreground">Søker…</p>
                              ) : null}
                              {(() => {
                                const normalized = trimmedIngSearch.toLowerCase();
                                const available = ingredientSuggestions.filter(
                                  (ing) =>
                                    !ingList.some((i) => i.name.toLowerCase() === ing.name.toLowerCase())
                                );

                                if (available.length > 0) {
                                  return (
                                    <ScrollArea className="max-h-40 pr-2">
                                      <div className="flex flex-wrap gap-2 pb-2">
                                        {available.map((ing) => (
                                          <Badge
                                            key={ing.id}
                                            className="cursor-pointer"
                                            onClick={() => addIngredientByName(ing.name, ing.unit)}
                                          >
                                            {ing.name}
                                            {ing.unit ? <span className="opacity-60">&nbsp;({ing.unit})</span> : null}
                                          </Badge>
                                        ))}
                                      </div>
                                    </ScrollArea>
                                  );
                                }

                                if (
                                  !ingredientQuery.isFetching &&
                                  trimmedIngSearch.length > 0 &&
                                  !ingredientSuggestions.some((i) => i.name.toLowerCase() === normalized) &&
                                  !ingList.some((i) => i.name.toLowerCase() === normalized)
                                ) {
                                  return (
                                    <Badge className="cursor-pointer" onClick={() => addIngredientByName(trimmedIngSearch)}>
                                      Legg til "{trimmedIngSearch}"
                                    </Badge>
                                  );
                                }

                                return null;
                              })()}
                            </div>
                          ) : null}
                          {ingList.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {ingList.map((i) => (
                                <span
                                  key={i.name}
                                  className="inline-flex items-center gap-2 rounded-sm border bg-background px-2 py-1 text-sm"
                                >
                                  <span>{i.name}</span>
                                  <Input
                                    className="h-7 w-20"
                                    placeholder={i.unit ?? "mengde"}
                                    value={typeof i.quantity === "number" ? String(i.quantity) : i.quantity ?? ""}
                                    onChange={(e) => upsertQuantity(i.name, e.target.value)}
                                  />
                                  {i.unit &&
                                  ((typeof i.quantity === "number" && !Number.isNaN(i.quantity)) ||
                                    (typeof i.quantity === "string" && i.quantity.trim() !== "")) ? (
                                    <span className="text-xs text-muted-foreground">{i.unit}</span>
                                  ) : null}
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-red-600"
                                    onClick={() => removeIngredient(i.name)}
                                    aria-label={`Fjern ${i.name}`}
                                    title={`Fjern ${i.name}`}
                                  >
                                    <X className="size-4" />
                                  </Button>
                                </span>
                              ))}
                            </div>
                          ) : trimmedIngSearch.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              Søk etter ingredienser for å legge dem til i oppskriften.
                            </p>
                          ) : null}
                        </div>
                      </CarouselItem>

                      <CarouselItem className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Beskrivelse</label>
                          <Textarea
                            value={desc}
                            onChange={(e) => setDesc(e.target.value)}
                            placeholder="Beskriv oppskriften kort eller legg inn notater."
                            rows={5}
                          />
                        </div>
                      </CarouselItem>
                    </CarouselContent>
                  </Carousel>
                </div>

                <DialogFooter className="!flex-col gap-2 sm:!flex-row sm:items-center sm:justify-between sm:space-x-0 max-sm:px-6 max-sm:pb-6 max-sm:pt-4 max-sm:gap-3 max-sm:border-t max-sm:border-border/60 max-sm:bg-background/95 max-sm:backdrop-blur">
                  <div className="flex w-full gap-2 sm:w-auto">
                    {currentStep > 0 ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 sm:flex-none"
                        onClick={() => carouselApi?.scrollTo(currentStep - 1)}
                      >
                        Forrige
                      </Button>
                    ) : null}
                  </div>
                  <div className="flex w-full justify-end gap-2 sm:w-auto">
                    {isLastStep ? (
                      <Button type="submit" className="flex-1 sm:flex-none" disabled={create.isPending || update.isPending}>
                        {editId
                          ? update.isPending
                            ? "Oppdaterer…"
                            : "Oppdater"
                          : create.isPending
                            ? "Oppretter…"
                            : "Opprett"}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        className="flex-1 sm:flex-none"
                        onClick={() => carouselApi?.scrollTo(currentStep + 1)}
                        disabled={nextDisabled}
                      >
                        {nextLabel}
                      </Button>
                    )}
                  </div>
                </DialogFooter>
              </form>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isViewDialogOpen}
          onOpenChange={(open) => {
            setIsViewDialogOpen(open);
            if (!open) {
              setViewRecipeId(null);
            }
          }}
        >
          <DialogContent className={dialogContentClassName}>
            <div className="flex h-full flex-col max-sm:pt-[env(safe-area-inset-top)] max-sm:pb-[env(safe-area-inset-bottom)]">
              <DialogHeader className="max-sm:px-6 max-sm:pt-6 sm:px-0 sm:pt-0">
                <DialogTitle>{viewRecipe?.name ?? "Oppskrift"}</DialogTitle>
                <DialogDescription>
                  {viewRecipe
                    ? "Sveip for å se ingredienser og beskrivelse."
                    : "Oppskriften finnes ikke lenger."}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-1 flex-col gap-5 max-sm:overflow-hidden">
                <div className="max-sm:flex-1 max-sm:overflow-y-auto max-sm:px-6 sm:px-0">
                  {viewRecipe ? (
                    <Carousel className="w-full" opts={{ loop: false }}>
                      <CarouselContent>
                        <CarouselItem className="space-y-4">
                          <div className="space-y-4">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                              {viewRecipe.category ? (
                                <span className="font-semibold uppercase tracking-wide text-foreground">
                                  {viewRecipe.category}
                                </span>
                              ) : null}
                              <span>Helgescore: {viewRecipe.everydayScore ?? "–"}</span>
                              <span>Helsescore: {viewRecipe.healthScore ?? "–"}</span>
                            </div>
                            <div>
                              <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                                Ingredienser
                              </p>
                              {viewRecipe.ingredients && viewRecipe.ingredients.length > 0 ? (
                                <ul className="mt-2 space-y-1 text-sm text-foreground">
                                  {viewRecipe.ingredients.map((ri: any, idx: number) => (
                                    <li
                                      key={ri.ingredientId ?? `${ri.name}-${idx}`}
                                      className="leading-snug"
                                    >
                                      {formatIngredientLine(ri)}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-2 text-sm text-muted-foreground">Ingen ingredienser registrert.</p>
                              )}
                            </div>
                          </div>
                        </CarouselItem>
                        <CarouselItem className="space-y-4">
                          <div>
                            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                              Beskrivelse
                            </p>
                            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">
                              {viewRecipe.description ?? "Ingen beskrivelse lagt inn."}
                            </p>
                          </div>
                        </CarouselItem>
                      </CarouselContent>
                    </Carousel>
                  ) : (
                    <p className="text-sm text-muted-foreground">Kunne ikke finne oppskriften.</p>
                  )}
                </div>

                <DialogFooter className="!flex-col gap-2 sm:!flex-row sm:items-center sm:justify-end sm:space-x-2 max-sm:px-6 max-sm:pb-6 max-sm:pt-4 max-sm:gap-3 max-sm:border-t max-sm:border-border/60 max-sm:bg-background/95 max-sm:backdrop-blur">
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:gap-2">
                    <DialogClose asChild>
                      <Button type="button" variant="outline" className="flex-1 sm:flex-none">
                        Lukk
                      </Button>
                    </DialogClose>
                    {viewRecipe ? (
                      <Button type="button" className="flex-1 sm:flex-none" onClick={() => startEditFromView(viewRecipe.id)}>
                        Rediger
                      </Button>
                    ) : null}
                  </div>
                </DialogFooter>
              </div>
            </div>
          </DialogContent>
        </Dialog>
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
