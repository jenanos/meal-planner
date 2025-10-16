"use client";

import {
  Button,
  Carousel,
  CarouselContent,
  CarouselItem,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui";
import { X } from "lucide-react";
import type { CarouselApi } from "@repo/ui";

import { VIEW_STEPS } from "../constants";
import type { RecipeListItem } from "../types";
import { StepNav } from "./StepNav";

interface RecipeViewDialogProps {
  open: boolean;
  onOpenChange: (_open: boolean) => void;
  dialogContentClassName: string;
  viewRecipe: RecipeListItem | null;
  viewCurrentStep: number;
  viewCarouselApi: CarouselApi | null;
  setViewCarouselApi: (_api: CarouselApi | null) => void;
  formatIngredientLine: (_ingredient: {
    name: string;
    quantity?: number | string;
    unit?: string;
    notes?: string;
  }) => string;
  onEdit: (_id: string) => void;
}

export function RecipeViewDialog({
  open,
  onOpenChange,
  dialogContentClassName,
  viewRecipe,
  viewCurrentStep,
  viewCarouselApi,
  setViewCarouselApi,
  formatIngredientLine,
  onEdit,
}: RecipeViewDialogProps) {
  const stepLabels = VIEW_STEPS.map((s) => s.label);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogContentClassName}>
        <div className="flex h-full flex-col max-sm:pt-[env(safe-area-inset-top)] max-sm:pb-[env(safe-area-inset-bottom)]">
          <DialogHeader className="max-sm:px-6 max-sm:pt-6 sm:px-0 sm:pt-0">
            <div className="mb-3 flex items-center justify-between">
              <div>
                {viewRecipe ? (
                  <Button type="button" size="sm" onClick={() => onEdit(viewRecipe.id)}>
                    Rediger oppskrift
                  </Button>
                ) : null}
              </div>
              <DialogClose asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Lukk">
                  <X className="size-4" />
                </Button>
              </DialogClose>
            </div>
            <DialogTitle>{viewRecipe?.name ?? "Oppskrift"}</DialogTitle>
            <DialogDescription>
              {viewRecipe
                ? "Bla for å se ingredienser og beskrivelse."
                : "Oppskriften finnes ikke lenger."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-1 flex-col gap-5 max-sm:overflow-hidden">
            <StepNav
              current={viewCurrentStep}
              total={VIEW_STEPS.length}
              onPrev={() => viewCarouselApi?.scrollTo(viewCurrentStep - 1)}
              onNext={() => viewCarouselApi?.scrollTo(viewCurrentStep + 1)}
              onSelect={(idx) => viewCarouselApi?.scrollTo(idx)}
              className="max-sm:px-6 sm:px-0"
              stepLabels={stepLabels}
            />

            <div className="max-sm:flex-1 max-sm:overflow-y-auto max-sm:px-6 sm:px-0">
              {viewRecipe ? (
                <Carousel className="w-full" opts={{ loop: false }} setApi={setViewCarouselApi}>
                  <CarouselContent>
                    <CarouselItem className="space-y-4" id={VIEW_STEPS[0].id}>
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
                              {viewRecipe.ingredients.map((ingredient: any, index: number) => (
                                <li
                                  key={ingredient.ingredientId ?? `${ingredient.name}-${index}`}
                                  className="leading-snug"
                                >
                                  {formatIngredientLine(ingredient)}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 text-sm text-muted-foreground">Ingen ingredienser registrert.</p>
                          )}
                        </div>
                      </div>
                    </CarouselItem>
                    <CarouselItem className="space-y-4" id={VIEW_STEPS[1].id}>
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
              {/* dots moved into StepNav */}
            </div>
            {/* Footer now only provides safe-area padding on mobile */}
            <DialogFooter className="max-sm:px-6 max-sm:pb-6 max-sm:pt-4 max-sm:border-t max-sm:border-border/60 max-sm:bg-background/95 max-sm:backdrop-blur" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
