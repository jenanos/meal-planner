"use client";
export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import { BookOpen, ChevronRight } from "lucide-react";
import { cn } from "@repo/ui";

import { ingredientCategoryLabel } from "../../lib/shopping";
import { trpc } from "../../lib/trpcClient";
import type { RouterOutputs } from "../../lib/trpcTypes";
import { ListToolbar } from "../components/ListToolbar";
import { IngredientSheet, type IngredientSheetTarget } from "./components/IngredientSheet";

type IngredientListItem = RouterOutputs["ingredient"]["list"][number];

const FILTERS = [
  { id: "all", label: "Alle", test: (_item: IngredientListItem) => true },
  { id: "pantry", label: "Basisvarer", test: (item: IngredientListItem) => item.isPantryItem },
  { id: "no-unit", label: "Uten enhet", test: (item: IngredientListItem) => !item.unit },
  { id: "unused", label: "Ubrukte", test: (item: IngredientListItem) => item.usageCount === 0 },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

const collator = new Intl.Collator("nb", { sensitivity: "base" });

function initialOf(name: string) {
  const first = name.trim().charAt(0).toLocaleUpperCase("nb");
  // A letter has distinct cases; digits and symbols share one bucket.
  return first && first !== first.toLocaleLowerCase("nb") ? first : "#";
}

export default function IngredientsPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [sheet, setSheet] = useState<IngredientSheetTarget>(null);

  // The whole list is small enough to fetch once and filter as you type.
  const list = trpc.ingredient.list.useQuery(undefined);

  const items = useMemo(
    () => [...(list.data ?? [])].sort((a, b) => collator.compare(a.name, b.name)),
    [list.data],
  );

  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map(({ id, test }) => [id, items.filter(test).length]),
      ) as Record<FilterId, number>,
    [items],
  );

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const test = FILTERS.find(({ id }) => id === filter)?.test ?? (() => true);
    const result: { letter: string; items: IngredientListItem[] }[] = [];
    for (const item of items) {
      if (!test(item) || (term && !item.name.toLowerCase().includes(term))) continue;
      const letter = initialOf(item.name);
      const last = result[result.length - 1];
      if (last?.letter === letter) last.items.push(item);
      else result.push({ letter, items: [item] });
    }
    return result;
  }, [filter, items, search]);

  const selectedId = sheet && sheet.mode !== "create" ? sheet.id : null;

  return (
    <div className="space-y-4 max-md:pb-16">
      <h1 className="hidden text-xl font-bold text-center md:block">Ingredienser</h1>
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Søk etter ingredienser"
        addLabel="Ny ingrediens"
        onAdd={() => setSheet({ mode: "create" })}
      />

      <div
        role="group"
        aria-label="Filter"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {FILTERS.map(({ id, label }) => {
          const selected = filter === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/60 bg-background/70 text-foreground/80 active:bg-foreground/5",
              )}
              onClick={() => setFilter(id)}
            >
              {label}
              <span className={cn("tabular-nums", selected ? "opacity-80" : "text-muted-foreground")}>
                {counts[id]}
              </span>
            </button>
          );
        })}
      </div>

      {list.isLoading ? <p className="text-sm text-muted-foreground">Laster…</p> : null}
      {list.error ? (
        <p className="text-sm text-destructive">Kunne ikke laste ingrediensene.</p>
      ) : null}
      {!list.isLoading && !list.error && groups.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {search.trim() || filter !== "all" ? "Ingen ingredienser passer." : "Ingen ingredienser ennå."}
        </p>
      ) : null}

      <div className="space-y-3">
        {groups.map((group) => (
          <section key={group.letter} aria-label={group.letter}>
            <h2 className="sticky top-0 z-10 -mx-4 bg-background/90 px-5 py-1 text-xs font-bold uppercase tracking-wider text-primary backdrop-blur-sm sm:mx-0 sm:rounded-md sm:px-3">
              {group.letter}
            </h2>
            <ul className="grid grid-cols-1 gap-x-6 md:grid-cols-2 xl:grid-cols-3">
              {group.items.map((item) => (
                <li key={item.id} className="border-b border-border/30">
                  <button
                    type="button"
                    className={cn(
                      "flex min-h-[3.25rem] w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 active:bg-foreground/5 md:hover:bg-foreground/5",
                      item.id === selectedId && "bg-primary/10",
                    )}
                    onClick={() => setSheet({ mode: "view", id: item.id })}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-base font-medium leading-tight">
                          {item.name}
                        </span>
                        {item.isPantryItem ? (
                          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-px text-[11px] font-semibold text-emerald-900">
                            Basis
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[ingredientCategoryLabel(item.category), item.unit ?? "ingen enhet"].join(" · ")}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 text-sm tabular-nums",
                        item.usageCount === 0 ? "text-muted-foreground/60" : "text-muted-foreground",
                      )}
                      aria-label={
                        item.usageCount === 1 ? "1 oppskrift" : `${item.usageCount} oppskrifter`
                      }
                    >
                      <BookOpen className="size-3.5" aria-hidden="true" />
                      {item.usageCount}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <IngredientSheet target={sheet} onTargetChange={setSheet} ingredients={items} />
    </div>
  );
}
