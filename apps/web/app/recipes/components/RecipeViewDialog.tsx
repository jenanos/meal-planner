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
  cn,
} from "@repo/ui";
import type { CarouselApi } from "@repo/ui";

import { VIEW_STEPS } from "../constants";
import type { RecipeListItem } from "../types";

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogContentClassName}>
        <div className="flex h-full flex-col max-sm:pt-[env(safe-area-inset-top)] max-sm:pb-[env(safe-area-inset-bottom)]">
          <DialogHeader className="max-sm:px-6 max-sm:pt-6 sm:px-0 sm:pt-0">
            <DialogTitle>{viewRecipe?.name ?? "Oppskrift"}</DialogTitle>
            <DialogDescription>
              {viewRecipe
                ? "Bla for å se ingredienser og beskrivelse."
                : "Oppskriften finnes ikke lenger."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-1 flex-col gap-5 max-sm:overflow-hidden">
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
              {viewRecipe ? (
                <div className="mt-4 flex justify-center gap-2" role="tablist" aria-label="Vis oppskrift">
                  {VIEW_STEPS.map((step, index) => (
                    <button
                      key={step.id}
                      type="button"
                      role="tab"
                      aria-selected={viewCurrentStep === index}
                      className={cn(
                        "h-2 w-8 rounded-full transition-colors",
                        viewCurrentStep === index ? "bg-primary" : "bg-muted-foreground/30"
                      )}
                      onClick={() => viewCarouselApi?.scrollTo(index)}
                      aria-label={step.label}
                      aria-controls={step.id}
                    />
                  ))}
                </div>
              ) : null}
            </div>

            <DialogFooter className="!flex-col gap-2 sm:!flex-row sm:items-center sm:justify-end sm:space-x-2 max-sm:px-6 max-sm:pb-6 max-sm:pt-4 max-sm:gap-3 max-sm:border-t max-sm:border-border/60 max-sm:bg-background/95 max-sm:backdrop-blur">
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="outline" className="flex-1 sm:flex-none">
                    Lukk
                  </Button>
                </DialogClose>
                {viewRecipe ? (
                  <Button type="button" className="flex-1 sm:flex-none" onClick={() => onEdit(viewRecipe.id)}>
                    Rediger
                  </Button>
                ) : null}
              </div>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
