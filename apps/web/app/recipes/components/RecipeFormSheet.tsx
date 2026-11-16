"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronRight, Minus, Plus, Search, X } from "lucide-react";
import { Button, Input, Textarea, cn } from "@repo/ui";

import { EVERYDAY_LABELS, HEALTH_LABELS } from "../../../lib/scoreLabels";
import { CATEGORY_LABELS, CategoryEmoji } from "../../components/CategoryEmoji";
import { Sheet, SheetConfirm } from "../../components/Sheet";
import { CATEGORIES } from "../constants";
import type { RecipeDialogState } from "../hooks/useRecipeDialogState";

const MAX_SUGGESTIONS = 6;

const fieldClassName = "h-11 text-base md:text-base";

/**
 * Create or edit a recipe as one scrolling form. Nothing is hidden behind
 * steps: the save action sits in the header, clear of the keyboard, and the
 * sheet itself shrinks to the space the keyboard leaves.
 */
export function RecipeFormSheet({ state }: { state: RecipeDialogState }) {
  const {
    isEditDialogOpen,
    onFormOpenChange,
    editId,
    isDirty,
    submitError,
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
    isIngredientQueryFetching,
    ingList,
    addIngredientByName,
    removeIngredient,
    upsertQuantity,
    upsertUnit,
    persistUnit,
    submitRecipe,
    createIsPending,
    updateIsPending,
  } = state;

  const formId = useId();
  const nameRef = useRef<HTMLInputElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const quantityRefs = useRef(new Map<string, HTMLInputElement>());
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const isPending = createIsPending || updateIsPending;
  const hasName = name.trim().length > 0;
  const hasIngredients = ingList.length > 0;
  const submitDisabled = !hasName || !hasIngredients || isPending;

  useEffect(() => {
    if (!isEditDialogOpen) setConfirmDiscard(false);
  }, [isEditDialogOpen]);

  // After adding an ingredient, move straight on to its quantity.
  const focusNewIngredient = useRef(false);
  const ingredientCount = useRef(ingList.length);
  useEffect(() => {
    if (focusNewIngredient.current && ingList.length > ingredientCount.current) {
      focusNewIngredient.current = false;
      const added = ingList[ingList.length - 1];
      if (added) quantityRefs.current.get(added.name)?.focus();
    }
    ingredientCount.current = ingList.length;
  }, [ingList]);
  useEffect(() => {
    focusNewIngredient.current = false;
  }, [isEditDialogOpen]);

  const normalizedSearch = trimmedIngSearch.toLowerCase();
  const inList = (candidate: string) =>
    ingList.some((ingredient) => ingredient.name.toLowerCase() === candidate.toLowerCase());
  const availableSuggestions = ingredientSuggestions.filter(
    (suggestion) => !inList(suggestion.name),
  );
  // Partial matches (e.g. "aspargesbønner" when searching for "asparges") must
  // not hide the option to create the new ingredient — only an exact name match
  // does. Offering it requires results for the term actually on screen: creating
  // off stale results would upsert over an existing ingredient.
  const canCreate =
    trimmedIngSearch.length > 0 &&
    ingredientResultsAreCurrent &&
    !ingredientSuggestions.some((suggestion) => suggestion.name.toLowerCase() === normalizedSearch) &&
    !inList(trimmedIngSearch);
  const alreadyAdded = trimmedIngSearch.length > 0 && inList(trimmedIngSearch);

  const addIngredient = (ingredientName: string, unit?: string, id?: string) => {
    focusNewIngredient.current = true;
    addIngredientByName(ingredientName, unit, id);
  };

  const submitSearch = () => {
    if (!trimmedIngSearch) return;
    const exact = availableSuggestions.find(
      (suggestion) => suggestion.name.toLowerCase() === normalizedSearch,
    );
    if (exact) {
      addIngredient(exact.name, exact.unit, exact.id);
    } else if (canCreate) {
      addIngredient(trimmedIngSearch);
    } else if (ingredientResultsAreCurrent && availableSuggestions[0]) {
      const first = availableSuggestions[0];
      addIngredient(first.name, first.unit, first.id);
    }
  };

  const focusSearch = () => searchRef.current?.focus();

  // The keyboard's enter key must never submit a half-filled recipe.
  const blockImplicitSubmit = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      event.target.blur();
    }
  };

  return (
    <Sheet
      open={isEditDialogOpen}
      onClose={() => onFormOpenChange(false)}
      beforeClose={() => {
        if (!isDirty || isPending) return true;
        setConfirmDiscard(true);
        return false;
      }}
      title={editId ? "Rediger oppskrift" : "Ny oppskrift"}
      description="Fyll ut feltene og lagre oppskriften."
      initialFocus={editId ? undefined : nameRef}
      action={
        <Button
          type="submit"
          form={formId}
          className="h-10 rounded-full px-5"
          disabled={submitDisabled}
        >
          {isPending ? "Lagrer…" : "Lagre"}
        </Button>
      }
      overlay={
        confirmDiscard ? (
          <SheetConfirm
            title="Forkaste endringene?"
            cancelLabel="Fortsett"
            confirmLabel="Forkast"
            onCancel={() => setConfirmDiscard(false)}
            onConfirm={() => onFormOpenChange(false)}
          />
        ) : null
      }
    >
      <form
        id={formId}
        className="space-y-7"
        onSubmit={submitRecipe}
        onKeyDown={blockImplicitSubmit}
        noValidate
      >
        <Field label="Navn" htmlFor={`${formId}-name`}>
          <Input
            ref={nameRef}
            id={`${formId}-name`}
            className={fieldClassName}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Hva heter retten?"
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="done"
          />
          {!editId && matchingRecipes.length > 0 ? (
            <div className="mt-3 overflow-hidden rounded-xl border border-border/50">
              <p className="bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                Finnes fra før
              </p>
              <ul className="divide-y divide-border/40">
                {matchingRecipes.slice(0, 4).map((recipe) => (
                  <li key={recipe.id}>
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm outline-none active:bg-foreground/5 focus-visible:bg-foreground/5"
                      onClick={() => onSelectExistingRecipe(recipe.id)}
                    >
                      <span className="min-w-0 truncate">{recipe.name}</span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Field>

        <Field label="Kategori">
          <div role="radiogroup" aria-label="Kategori" className="grid grid-cols-5 gap-2">
            {CATEGORIES.map((category) => {
              const selected = cat === category;
              return (
                <button
                  key={category}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={cn(
                    "flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-2 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60",
                    selected
                      ? "border-primary bg-primary/10 font-semibold text-foreground ring-1 ring-primary"
                      : "border-border/50 text-muted-foreground active:bg-foreground/5",
                  )}
                  onClick={() => setCat(category)}
                >
                  <CategoryEmoji category={category} size={11} showSrLabel={false} />
                  {CATEGORY_LABELS[category]}
                </button>
              );
            })}
          </div>
        </Field>

        <ScoreField
          label="Hverdag eller helg"
          labels={EVERYDAY_LABELS}
          value={everyday}
          onChange={setEveryday}
        />

        <ScoreField label="Sunnhet" labels={HEALTH_LABELS} value={health} onChange={setHealth} />

        <Field
          label="Porsjoner"
          htmlFor={`${formId}-servings`}
          hint="Hvor mange mengdene er beregnet for. Brukes til å tilpasse handlelisten til husstanden."
        >
          <ServingsStepper id={`${formId}-servings`} value={servings} onChange={setServings} />
        </Field>

        <Field
          label="Ingredienser"
          aside={hasIngredients ? String(ingList.length) : undefined}
        >
          {hasIngredients ? (
            <ul className="mb-3 divide-y divide-border/40 border-y border-border/40">
              {ingList.map((ingredient) => (
                <li key={ingredient.name} className="flex items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1 text-base leading-snug">
                    <span className="line-clamp-2 break-words">{ingredient.name}</span>
                    {ingredient.notes ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {ingredient.notes}
                      </span>
                    ) : null}
                  </span>
                  <Input
                    ref={(element) => {
                      if (element) quantityRefs.current.set(ingredient.name, element);
                      else quantityRefs.current.delete(ingredient.name);
                    }}
                    className={cn(fieldClassName, "w-[4.5rem] shrink-0 px-2 text-right tabular-nums")}
                    inputMode="decimal"
                    enterKeyHint="next"
                    autoComplete="off"
                    placeholder="Antall"
                    aria-label={`Mengde ${ingredient.name}`}
                    value={
                      typeof ingredient.quantity === "number"
                        ? String(ingredient.quantity)
                        : ingredient.quantity ?? ""
                    }
                    onChange={(event) => upsertQuantity(ingredient.name, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      event.stopPropagation();
                      focusSearch();
                    }}
                  />
                  <Input
                    className={cn(fieldClassName, "w-16 shrink-0 px-2 text-muted-foreground")}
                    enterKeyHint="next"
                    autoComplete="off"
                    autoCapitalize="none"
                    placeholder="Enhet"
                    aria-label={`Enhet ${ingredient.name}`}
                    value={ingredient.unit ?? ""}
                    onChange={(event) => upsertUnit(ingredient.name, event.target.value)}
                    onBlur={() => persistUnit(ingredient.name)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      event.stopPropagation();
                      focusSearch();
                    }}
                  />
                  <button
                    type="button"
                    className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/60 active:bg-foreground/5"
                    onClick={() => removeIngredient(ingredient.name)}
                    aria-label={`Fjern ${ingredient.name}`}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {/* Scrolled to the top on focus, so the suggestions clear the keyboard. */}
          <div data-scroll-anchor="start">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                ref={searchRef}
                className={cn(fieldClassName, "pl-9")}
                value={ingSearch}
                onChange={(event) => setIngSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  event.stopPropagation();
                  submitSearch();
                }}
                placeholder={hasIngredients ? "Legg til flere…" : "Søk etter ingrediens…"}
                aria-label="Søk etter ingrediens"
                autoComplete="off"
                autoCapitalize="none"
                enterKeyHint="search"
              />
            </div>

            {trimmedIngSearch.length > 0 ? (
              <ul
                className="mt-2 divide-y divide-border/40 overflow-hidden rounded-xl border border-border/50"
                aria-label="Forslag"
              >
                {canCreate ? (
                  <SuggestionRow onSelect={() => addIngredient(trimmedIngSearch)}>
                    <span className="min-w-0 truncate">
                      Opprett «<span className="font-semibold">{trimmedIngSearch}</span>»
                    </span>
                  </SuggestionRow>
                ) : null}
                {availableSuggestions.slice(0, MAX_SUGGESTIONS).map((suggestion) => (
                  <SuggestionRow
                    key={suggestion.id}
                    onSelect={() => addIngredient(suggestion.name, suggestion.unit, suggestion.id)}
                  >
                    <span className="min-w-0 flex-1 truncate">{suggestion.name}</span>
                    {suggestion.unit ? (
                      <span className="shrink-0 text-sm text-muted-foreground">
                        {suggestion.unit}
                      </span>
                    ) : null}
                  </SuggestionRow>
                ))}
                {!canCreate && availableSuggestions.length === 0 ? (
                  <li className="px-3 py-3 text-sm text-muted-foreground">
                    {alreadyAdded
                      ? "Ligger allerede i oppskriften."
                      : isIngredientQueryFetching
                        ? "Søker…"
                        : "Ingen treff."}
                  </li>
                ) : null}
              </ul>
            ) : !hasIngredients ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Oppskriften trenger minst én ingrediens.
              </p>
            ) : null}
          </div>
        </Field>

        <Field label="Beskrivelse" htmlFor={`${formId}-description`}>
          <Textarea
            id={`${formId}-description`}
            className="min-h-32 text-base leading-relaxed md:text-base"
            value={desc}
            onChange={(event) => setDesc(event.target.value)}
            placeholder="Fremgangsmåte, tips eller notater."
            autoCapitalize="sentences"
          />
        </Field>

        {submitError ? (
          <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Kunne ikke lagre oppskriften. Prøv igjen.
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}

function Field({
  label,
  htmlFor,
  aside,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  aside?: ReactNode;
  hint?: string;
  children: ReactNode;
}) {
  const Label = htmlFor ? "label" : "p";
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <Label htmlFor={htmlFor} className="text-sm font-semibold">
          {label}
        </Label>
        {aside ? <span className="text-sm text-muted-foreground">{aside}</span> : null}
      </div>
      {children}
      {hint ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** A 1–5 score as a segmented control, with the chosen level spelled out. */
function ScoreField({
  label,
  labels,
  value,
  onChange,
}: {
  label: string;
  labels: Record<number, string>;
  value: number;
  onChange: (_value: number) => void;
}) {
  return (
    <Field label={label} aside={labels[value]}>
      <div
        role="radiogroup"
        aria-label={label}
        className="grid grid-cols-5 gap-1 rounded-xl bg-muted/60 p-1"
      >
        {Object.entries(labels).map(([key, levelLabel]) => {
          const score = Number(key);
          const selected = score === value;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={levelLabel}
              className={cn(
                "h-10 rounded-lg text-sm font-semibold tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60",
                selected
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground active:bg-foreground/5",
              )}
              onClick={() => onChange(score)}
            >
              {score}
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-muted-foreground" aria-hidden="true">
        <span>{labels[1]}</span>
        <span>{labels[5]}</span>
      </div>
    </Field>
  );
}

function ServingsStepper({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (_value: string) => void;
}) {
  const parsed = Number.parseInt(value, 10);
  const current = Number.isInteger(parsed) ? parsed : null;
  const step = (delta: number) => {
    const next = current == null ? (delta > 0 ? 4 : 1) : current + delta;
    onChange(next < 1 ? "" : String(Math.min(100, next)));
  };
  const stepButton =
    "inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border/60 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:bg-foreground/5 disabled:opacity-40";
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className={stepButton}
        onClick={() => step(-1)}
        disabled={current == null}
        aria-label="Færre porsjoner"
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <Input
        id={id}
        className={cn(fieldClassName, "w-20 text-center tabular-nums")}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        enterKeyHint="done"
        placeholder="–"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 3))}
      />
      <button
        type="button"
        className={stepButton}
        onClick={() => step(1)}
        disabled={current != null && current >= 100}
        aria-label="Flere porsjoner"
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
      {current == null ? (
        <span className="text-sm text-muted-foreground">Ikke oppgitt</span>
      ) : null}
    </div>
  );
}

function SuggestionRow({ onSelect, children }: { onSelect: () => void; children: ReactNode }) {
  return (
    <li>
      <button
        type="button"
        className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-base outline-none active:bg-foreground/5 focus-visible:bg-foreground/5"
        // Keep focus – and with it the keyboard – in the search field.
        onPointerDown={(event) => event.preventDefault()}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onSelect}
      >
        <Plus className="size-4 shrink-0 text-primary" aria-hidden="true" />
        {children}
      </button>
    </li>
  );
}
