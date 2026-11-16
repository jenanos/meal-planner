"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { ChevronRight, Pencil } from "lucide-react";
import { Button, Input, cn } from "@repo/ui";

import { ingredientCategoryLabel } from "../../../lib/shopping";
import { trpc } from "../../../lib/trpcClient";
import type { RouterOutputs } from "../../../lib/trpcTypes";
import { CategoryEmoji } from "../../components/CategoryEmoji";
import { Sheet } from "../../components/Sheet";

type IngredientListItem = RouterOutputs["ingredient"]["list"][number];

/** What the sheet is showing; `null` when it is closed. */
export type IngredientSheetTarget =
  | { mode: "view"; id: string }
  | { mode: "edit"; id: string }
  | { mode: "create" }
  | null;

type IngredientSheetProps = {
  target: IngredientSheetTarget;
  onTargetChange: (_target: IngredientSheetTarget) => void;
  /** Every ingredient, for spotting names that are already taken. */
  ingredients: readonly IngredientListItem[];
};

const COMMON_UNITS = ["g", "kg", "dl", "l", "ss", "ts", "stk", "pakke", "boks"] as const;

const fieldClassName = "h-11 text-base md:text-base";

/**
 * One bottom sheet for looking at an ingredient, changing it and adding a new
 * one. Switching between looking and changing happens in place.
 */
export function IngredientSheet({ target, onTargetChange, ingredients }: IngredientSheetProps) {
  const utils = trpc.useUtils();
  const formId = useId();
  const nameRef = useRef<HTMLInputElement | null>(null);

  // Keep showing the last target while the sheet animates away.
  const lastTarget = useRef(target);
  if (target) lastTarget.current = target;
  const shown = target ?? lastTarget.current;
  const mode = shown?.mode ?? "view";
  const id = shown && shown.mode !== "create" ? shown.id : null;

  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [isPantryItem, setIsPantryItem] = useState(false);

  const detail = trpc.ingredient.getWithRecipes.useQuery({ id: id! }, { enabled: !!id });
  const listed = useMemo(
    () => (id ? ingredients.find((ingredient) => ingredient.id === id) : undefined),
    [id, ingredients],
  );
  // The list row is on hand at once; the detail query adds the recipes.
  const ingredient = detail.data ?? listed;

  const refresh = async () => {
    await Promise.all([
      utils.ingredient.list.invalidate(),
      utils.ingredient.getWithRecipes.invalidate(),
    ]).catch(() => undefined);
  };

  const create = trpc.ingredient.create.useMutation({
    onSuccess: async (created) => {
      await refresh();
      onTargetChange({ mode: "view", id: created.id });
    },
  });
  const update = trpc.ingredient.update.useMutation({
    onSuccess: async (updated) => {
      await refresh();
      onTargetChange({ mode: "view", id: updated.id });
    },
  });
  const mutation = mode === "edit" ? update : create;

  // Fill the form whenever it is brought up. Keyed on the target alone: the
  // ingredient refetching mid-edit must not overwrite what is being typed.
  const targetKey = target ? `${target.mode}:${"id" in target ? target.id : ""}` : null;
  const fillForm = useRef(() => {});
  fillForm.current = () => {
    if (!target || target.mode === "view") return;
    create.reset();
    update.reset();
    setName(target.mode === "edit" ? (ingredient?.name ?? "") : "");
    setUnit(target.mode === "edit" ? (ingredient?.unit ?? "") : "");
    setIsPantryItem(target.mode === "edit" ? Boolean(ingredient?.isPantryItem) : false);
  };
  useEffect(() => {
    fillForm.current();
  }, [targetKey]);

  const trimmedName = name.trim();
  const loweredName = trimmedName.toLowerCase();
  const nameMatches = useMemo(() => {
    if (!loweredName) return [];
    return ingredients
      .filter((other) => other.id !== id && other.name.toLowerCase().includes(loweredName))
      .slice(0, 4);
  }, [id, ingredients, loweredName]);
  // Saving under a taken name would silently overwrite that ingredient.
  const nameTaken = ingredients.some(
    (other) => other.id !== id && other.name.toLowerCase() === loweredName,
  );
  const submitDisabled = !trimmedName || nameTaken || mutation.isPending;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitDisabled) return;
    const payload = { name: trimmedName, unit: unit.trim() || undefined, isPantryItem };
    if (mode === "edit" && id) update.mutate({ id, ...payload });
    else create.mutate(payload);
  };

  const recipes = detail.data?.recipes;
  const isForm = mode !== "view";

  return (
    <Sheet
      variant="bottom"
      open={target !== null}
      onClose={() => onTargetChange(null)}
      // Backing out of an edit returns to the ingredient, not to the list.
      beforeClose={() => {
        if (target?.mode !== "edit" || mutation.isPending) return true;
        onTargetChange({ mode: "view", id: target.id });
        return false;
      }}
      dismissIcon={mode === "edit" ? "back" : "close"}
      title={
        mode === "create"
          ? "Ny ingrediens"
          : mode === "edit"
            ? "Endre ingrediens"
            : (ingredient?.name ?? "Ingrediens")
      }
      initialFocus={mode === "create" ? nameRef : undefined}
      action={
        // Distinct keys: were React to reuse one button for both, the tap on
        // "Endre" would end as a click on a submit button and save at once.
        isForm ? (
          <Button
            key="save"
            type="submit"
            form={formId}
            className="h-10 rounded-full px-5"
            disabled={submitDisabled}
          >
            {mutation.isPending ? "Lagrer…" : "Lagre"}
          </Button>
        ) : (
          <Button
            key="edit"
            type="button"
            variant="ghost"
            className="h-11 gap-2 rounded-full px-4 text-primary hover:text-primary"
            disabled={!ingredient}
            onClick={() => id && onTargetChange({ mode: "edit", id })}
          >
            <Pencil className="size-4" aria-hidden="true" />
            Endre
          </Button>
        )
      }
    >
      {isForm ? (
        <form id={formId} className="space-y-6" onSubmit={submit} noValidate>
          <div>
            <label htmlFor={`${formId}-name`} className="mb-2 block text-sm font-semibold">
              Navn
            </label>
            <Input
              ref={nameRef}
              id={`${formId}-name`}
              className={fieldClassName}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              enterKeyHint="next"
              aria-invalid={nameTaken || undefined}
            />
            {nameTaken ? (
              <p className="mt-2 text-sm text-destructive">Denne ingrediensen finnes allerede.</p>
            ) : null}
            {nameMatches.length > 0 ? (
              <div className="mt-3 overflow-hidden rounded-xl border border-border/50">
                <p className="bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  Finnes fra før
                </p>
                <ul className="divide-y divide-border/40">
                  {nameMatches.map((match) => (
                    <li key={match.id}>
                      <button
                        type="button"
                        className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm outline-none active:bg-foreground/5 focus-visible:bg-foreground/5"
                        onClick={() => onTargetChange({ mode: "view", id: match.id })}
                      >
                        <span className="min-w-0 flex-1 truncate">{match.name}</span>
                        {match.unit ? (
                          <span className="shrink-0 text-muted-foreground">{match.unit}</span>
                        ) : null}
                        <ChevronRight
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div>
            <label htmlFor={`${formId}-unit`} className="mb-2 block text-sm font-semibold">
              Enhet
            </label>
            <Input
              id={`${formId}-unit`}
              className={fieldClassName}
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              placeholder="f.eks. g, dl, stk"
              autoComplete="off"
              autoCapitalize="none"
              enterKeyHint="done"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {COMMON_UNITS.map((option) => {
                const selected = unit.trim() === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    className={cn(
                      "h-9 min-w-11 rounded-full border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                      selected
                        ? "border-primary bg-primary/10 font-semibold"
                        : "border-border/60 text-muted-foreground active:bg-foreground/5",
                    )}
                    onClick={() => setUnit(selected ? "" : option)}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={isPantryItem}
            className="flex w-full items-center justify-between gap-4 rounded-xl border border-border/50 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            onClick={() => setIsPantryItem((value) => !value)}
          >
            <span>
              <span className="block text-sm font-semibold">Basisvare</span>
              <span className="block text-xs text-muted-foreground">
                Noe dere vanligvis har hjemme.
              </span>
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                isPantryItem ? "bg-primary" : "bg-foreground/20",
              )}
            >
              <span
                className={cn(
                  "absolute left-0.5 top-0.5 size-6 rounded-full bg-white shadow transition-transform",
                  isPantryItem && "translate-x-5",
                )}
              />
            </span>
          </button>

          {mutation.error ? (
            <p
              role="alert"
              className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              Kunne ikke lagre ingrediensen. Prøv igjen.
            </p>
          ) : null}
        </form>
      ) : (
        <div className="space-y-6">
          {ingredient ? (
            <ul className="flex flex-wrap gap-2 text-sm">
              <li className="rounded-full bg-muted/70 px-3 py-1">
                {ingredient.unit ? `Enhet: ${ingredient.unit}` : "Ingen enhet"}
              </li>
              <li className="rounded-full bg-muted/70 px-3 py-1">
                {ingredientCategoryLabel(ingredient.category)}
              </li>
              {ingredient.isPantryItem ? (
                <li className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-900">
                  Basisvare
                </li>
              ) : null}
            </ul>
          ) : null}

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Brukes i
              {recipes ? (
                <span className="ml-1.5 font-normal normal-case tracking-normal">
                  ({recipes.length})
                </span>
              ) : null}
            </h3>
            {detail.error ? (
              <p className="text-sm text-destructive">Kunne ikke laste oppskriftene.</p>
            ) : !recipes ? (
              <p className="text-sm text-muted-foreground">Laster…</p>
            ) : recipes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ingen oppskrifter bruker denne ingrediensen ennå.
              </p>
            ) : (
              <ul className="divide-y divide-border/40">
                {recipes.map((recipe) => (
                  <li key={recipe.id} className="flex items-center gap-3 py-2.5 text-base">
                    <CategoryEmoji category={recipe.category} size={9} />
                    <span className="min-w-0 break-words">{recipe.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Sheet>
  );
}
