"use client";

import {
  Button,
  Carousel,
  CarouselContent,
  CarouselItem,
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui";
import { X } from "lucide-react";
import type { CarouselApi } from "@repo/ui";

import { VIEW_STEPS } from "../constants";
import type { RecipeListItem } from "../types";
import { StepNav } from "./StepNav";
import { CategoryEmoji } from "../../components/CategoryEmoji";
import { describeEveryday, describeHealth } from "../../../lib/scoreLabels";

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
          <DialogHeader className="sm:px-0 sm:pt-0">
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
          </DialogHeader>

          <div className="flex flex-1 flex-col gap-5">
            <StepNav
              current={viewCurrentStep}
              total={VIEW_STEPS.length}
              onPrev={() => viewCarouselApi?.scrollTo(viewCurrentStep - 1)}
              onNext={() => viewCarouselApi?.scrollTo(viewCurrentStep + 1)}
              onSelect={(idx) => viewCarouselApi?.scrollTo(idx)}
              className="max-sm:px-6 sm:px-0"
              stepLabels={stepLabels}
            />

            <div className="max-sm:flex-1 max-sm:overflow-y-auto sm:px-0">
              {viewRecipe ? (
                <Carousel className="w-full" opts={{ loop: false }} setApi={setViewCarouselApi}>
                  <CarouselContent>
                    <CarouselItem className="space-y-4" id={VIEW_STEPS[0].id}>
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                          <span>{describeEveryday(viewRecipe.everydayScore)}</span>
                          {viewRecipe.category ? (
                            <span className="inline-flex items-center gap-1 text-foreground">
                              <CategoryEmoji category={viewRecipe.category as any} size={14} showSrLabel={false} />
                            </span>
                          ) : null}
                          <span>{describeHealth(viewRecipe.healthScore)}</span>
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
            {/* Footer removed */}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
