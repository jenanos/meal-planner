"use client";

import type React from "react";

import { X } from "lucide-react";

import {
  Badge,
  Button,
  Carousel,
  CarouselContent,
  CarouselItem,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
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
  cn,
} from "@repo/ui";
import type { CarouselApi } from "@repo/ui";

import { EVERYDAY_LABELS, HEALTH_LABELS } from "../../../lib/scoreLabels";
import { CategoryEmoji } from "../../components/CategoryEmoji";
import { CATEGORIES } from "../constants";
import type { FormIngredient, IngredientSuggestion, RecipeListItem } from "../types";
import { StepNav } from "./StepNav";

interface RecipeFormDialogProps {
  open: boolean;
  onOpenChange: (_open: boolean) => void;
  onCreateClick: () => void;
  dialogContentClassName: string;
  editId: string | null;
  currentStep: number;
  stepTitles: readonly string[];
  stepDescriptions: readonly string[];
  carouselApi: CarouselApi | null;
  setCarouselApi: (_api: CarouselApi | null) => void;
  isLastStep: boolean;
  nextDisabled: boolean;
  nextLabel: string | null;
  name: string;
  onNameChange: (_value: string) => void;
  matchingRecipes: RecipeListItem[];
  onSelectExistingRecipe: (_id: string) => void;
  cat: (typeof CATEGORIES)[number];
  onCategoryChange: (_value: (typeof CATEGORIES)[number]) => void;
  everyday: number;
  onEverydayChange: (_value: number) => void;
  health: number;
  onHealthChange: (_value: number) => void;
  desc: string;
  onDescChange: (_value: string) => void;
  ingSearch: string;
  onIngSearchChange: (_value: string) => void;
  trimmedIngSearch: string;
  ingredientSuggestions: IngredientSuggestion[];
  isIngredientQueryFetching: boolean;
  ingList: FormIngredient[];
  addIngredientByName: (_name: string, _unit?: string) => void;
  removeIngredient: (_name: string) => void;
  upsertQuantity: (_name: string, _qty: string) => void;
  onSubmit: (_event: React.FormEvent<HTMLFormElement>) => void;
  createIsPending: boolean;
  updateIsPending: boolean;
  hideTrigger?: boolean;
}

export function RecipeFormDialog({
  open,
  onOpenChange,
  onCreateClick,
  dialogContentClassName,
  editId,
  currentStep,
  stepTitles,
  stepDescriptions,
  carouselApi,
  setCarouselApi,
  isLastStep: _isLastStep,
  nextDisabled: _nextDisabled,
  nextLabel: _nextLabel,
  name,
  onNameChange,
  matchingRecipes,
  onSelectExistingRecipe,
  cat,
  onCategoryChange,
  everyday,
  onEverydayChange,
  health,
  onHealthChange,
  desc,
  onDescChange,
  ingSearch,
  onIngSearchChange,
  trimmedIngSearch,
  ingredientSuggestions,
  isIngredientQueryFetching,
  ingList,
  addIngredientByName,
  removeIngredient,
  upsertQuantity,
  onSubmit,
  createIsPending,
  updateIsPending,
  hideTrigger = false,
}: RecipeFormDialogProps) {
  const stepLabels = stepTitles.map((t) => t);
  const hasName = name.trim().length > 0;
  const hasDetails = Boolean(cat) && !Number.isNaN(everyday) && !Number.isNaN(health);
  const hasIngredients = ingList.length > 0;
  const canSubmitNow = hasName && hasDetails && hasIngredients;
  const submitDisabled = !canSubmitNow || createIsPending || updateIsPending;
  const formId = "recipe-form";
  const detailsStepIndex = stepTitles.findIndex((t) => t === "Detaljer");
  const scrollThisStep = currentStep !== detailsStepIndex;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {!hideTrigger ? (
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="min-w-[12rem]"
            onClick={(event) => {
              event.preventDefault();
              onCreateClick();
            }}
            type="button"
          >
            Legg til oppskrift
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent className={dialogContentClassName}>
        <div className="flex h-full min-h-0 flex-col max-sm:pt-[env(safe-area-inset-top)] max-sm:pb-[env(safe-area-inset-bottom)]">
          <DialogHeader className="text-center sm:text-left sm:px-0 sm:pt-0">
            <div className="mb-3 flex items-center justify-between">
              <Button
                type="submit"
                form={formId}
                size="sm"
                variant={submitDisabled ? "secondary" : "default"}
                className={cn(!submitDisabled && "bg-green-600 hover:bg-green-600/90")}
                disabled={submitDisabled}
              >
                {editId
                  ? updateIsPending
                    ? "Oppdaterer…"
                    : "Oppdater"
                  : createIsPending
                    ? "Oppretter…"
                    : "Opprett"}
              </Button>
              <DialogClose asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Lukk">
                  <X className="size-4" />
                </Button>
              </DialogClose>
            </div>
            <DialogTitle>{editId ? "Rediger oppskrift" : "Ny oppskrift"}</DialogTitle>
            <DialogDescription className="max-sm:hidden">
              {editId
                ? "Gjør endringer og lagre for å oppdatere oppskriften."
                : "Fyll ut feltene under og lagre for å legge til oppskriften."}
            </DialogDescription>
          </DialogHeader>

          <form
            className="flex flex-1 flex-col gap-5 min-h-0"
            onSubmit={onSubmit}
            id={formId}
          >
            <div className="flex flex-1 min-h-0 flex-col space-y-5 sm:space-y-5">
              <StepNav
                current={currentStep}
                total={stepTitles.length}
                onPrev={() => carouselApi?.scrollTo(currentStep - 1)}
                onNext={() => carouselApi?.scrollTo(currentStep + 1)}
                onSelect={(idx) => carouselApi?.scrollTo(idx)}
                description={stepDescriptions[currentStep]}
                stepLabels={stepLabels}
              />

              {/* Primary action moved to header (top-left) */}

              {/* Scroll only the content area below StepNav; keep dialog size fixed */}
              <div
                className={cn(
                  "flex-1 min-h-0 overflow-x-visible touch-pan-y [-webkit-overflow-scrolling:touch]",
                  scrollThisStep ? "overflow-y-auto" : "overflow-y-visible"
                )}
              >
                <Carousel className="w-full" setApi={setCarouselApi} opts={{ loop: false }}>
                  <CarouselContent>
                    <CarouselItem className="space-y-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium">Navn</label>
                        <Input
                          className="focus-visible:ring-inset"
                          value={name}
                          onChange={(event) => onNameChange(event.target.value)}
                          required
                          autoFocus={!editId}
                        />
                        {!editId ? (
                          <p className="text-xs text-muted-foreground max-sm:hidden">
                            Søk etter eksisterende oppskrifter mens du skriver.
                          </p>
                        ) : null}
                      </div>
                      {!editId && matchingRecipes.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Finnes fra før
                          </p>
                          <ScrollArea className="max-h-32 pr-2">
                            <div className="flex flex-wrap gap-2 pb-2">
                              {matchingRecipes.map((recipe) => (
                                <Badge
                                  key={recipe.id}
                                  className="cursor-pointer"
                                  onClick={() => onSelectExistingRecipe(recipe.id)}
                                >
                                  {recipe.name}
                                </Badge>
                              ))}
                            </div>
                          </ScrollArea>
                        </div>
                      ) : null}
                    </CarouselItem>

                    <CarouselItem className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-2 col-span-2 items-center">
                          <label className="text-sm font-medium text-center">Kategori</label>
                          <div className="flex w-full items-center justify-evenly">
                            {CATEGORIES.map((categoryKey) => {
                              const selected = cat === categoryKey;
                              return (
                                <Button
                                  key={categoryKey}
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className={cn(
                                    "h-10 w-10 p-0 rounded-full",
                                    selected && "bg-primary/90 text-primary-foreground"
                                  )}
                                  onClick={() => onCategoryChange(categoryKey)}
                                  aria-pressed={selected}
                                  title={categoryKey}
                                >
                                  <CategoryEmoji category={categoryKey as any} size={16} showSrLabel={false} />
                                </Button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-sm font-medium">Helgescore</label>
                          <Select value={String(everyday)} onValueChange={(value) => onEverydayChange(parseInt(value, 10))}>
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
                          <Select value={String(health)} onValueChange={(value) => onHealthChange(parseInt(value, 10))}>
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
                          className="focus-visible:ring-inset"
                          value={ingSearch}
                          onChange={(event) => onIngSearchChange(event.target.value)}
                          placeholder="Søk etter ingrediens"
                        />
                        {trimmedIngSearch.length > 0 ? (
                          <div className="space-y-2">
                            {isIngredientQueryFetching ? (
                              <p className="text-xs text-muted-foreground">Søker…</p>
                            ) : null}
                            {(() => {
                              const normalized = trimmedIngSearch.toLowerCase();
                              const available = ingredientSuggestions.filter(
                                (suggestion) =>
                                  !ingList.some((ingredient) => ingredient.name.toLowerCase() === suggestion.name.toLowerCase())
                              );

                              if (available.length > 0) {
                                return (
                                  <ScrollArea className="max-h-40 pr-2">
                                    <div className="flex flex-wrap gap-2 pb-2">
                                      {available.map((suggestion) => (
                                        <Badge
                                          key={suggestion.id}
                                          className="cursor-pointer"
                                          onClick={() => addIngredientByName(suggestion.name, suggestion.unit)}
                                        >
                                          {suggestion.name}
                                          {suggestion.unit ? <span className="opacity-60">&nbsp;({suggestion.unit})</span> : null}
                                        </Badge>
                                      ))}
                                    </div>
                                  </ScrollArea>
                                );
                              }

                              if (
                                !isIngredientQueryFetching &&
                                trimmedIngSearch.length > 0 &&
                                !ingredientSuggestions.some((suggestion) => suggestion.name.toLowerCase() === normalized) &&
                                !ingList.some((ingredient) => ingredient.name.toLowerCase() === normalized)
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
                            {ingList.map((ingredient) => (
                              <span
                                key={ingredient.name}
                                className="inline-flex items-center gap-2 rounded-sm border bg-background px-2 py-1 text-sm"
                              >
                                <span>{ingredient.name}</span>
                                <Input
                                  className="h-7 w-20 focus-visible:ring-inset"
                                  placeholder={ingredient.unit ?? "mengde"}
                                  value={
                                    typeof ingredient.quantity === "number"
                                      ? String(ingredient.quantity)
                                      : ingredient.quantity ?? ""
                                  }
                                  onChange={(event) => upsertQuantity(ingredient.name, event.target.value)}
                                />
                                {ingredient.unit &&
                                  ((typeof ingredient.quantity === "number" && !Number.isNaN(ingredient.quantity)) ||
                                    (typeof ingredient.quantity === "string" && ingredient.quantity.trim() !== "")) ? (
                                  <span className="text-xs text-muted-foreground">{ingredient.unit}</span>
                                ) : null}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-red-600"
                                  onClick={() => removeIngredient(ingredient.name)}
                                  aria-label={`Fjern ${ingredient.name}`}
                                  title={`Fjern ${ingredient.name}`}
                                >
                                  <X className="size-4" />
                                </Button>
                              </span>
                            ))}
                          </div>
                        ) : trimmedIngSearch.length === 0 ? (
                          <p className="text-xs text-muted-foreground max-sm:hidden">
                            Søk etter ingredienser for å legge dem til i oppskriften.
                          </p>
                        ) : null}
                      </div>
                    </CarouselItem>

                    <CarouselItem className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Beskrivelse</label>
                        <Textarea
                          className="focus-visible:ring-inset"
                          value={desc}
                          onChange={(event) => onDescChange(event.target.value)}
                          placeholder="Beskriv oppskriften kort eller legg inn notater."
                          rows={5}
                        />
                      </div>
                    </CarouselItem>
                  </CarouselContent>
                </Carousel>
              </div>
            </div>

            {/* Footer removed */}
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
