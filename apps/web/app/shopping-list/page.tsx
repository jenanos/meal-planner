"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "../../lib/trpcClient";
import {
  Button,
  Badge,
  Input,
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  Separator,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@repo/ui";
import { X } from "lucide-react";
import { DayFilterDropdown } from "./components/day-filter-dropdown";
import {
  ShoppingListDayView,
  type ShoppingListDaySection,
} from "./components/shopping-list-day-view";
import { FALL_BADGE_PALETTE, formatQuantity } from "./utils";
import type { ShoppingListItem, ShoppingListOccurrence } from "./types";

export default function ShoppingListPage() {
  // Lock to current week only; backend can handle includeNextWeek
  const currentWeekStart = useMemo(() => new Date().toISOString(), []);
  const activeWeekStart = currentWeekStart;
  const [includeNextWeek, setIncludeNextWeek] = useState(false);
  const [viewMode, setViewMode] = useState<"by-day" | "alphabetical">("by-day");
  const [checkedByOccurrence, setCheckedByOccurrence] = useState<Record<string, boolean>>({});
  const [visibleDayKeys, setVisibleDayKeys] = useState<string[]>([]);
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(new Set());
  // Extras UI state
  const [isAddExtraOpen, setIsAddExtraOpen] = useState(false);
  const [extraInput, setExtraInput] = useState("");
  const [debouncedExtra, setDebouncedExtra] = useState("");

  const shoppingQuery = trpc.planner.shoppingList.useQuery({
    weekStart: activeWeekStart,
    includeNextWeek,
  });

  // Suggest extras based on input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedExtra(extraInput), 250);
    return () => clearTimeout(t);
  }, [extraInput]);

  const extraSuggest = trpc.planner.extraSuggest.useQuery(
    { search: debouncedExtra.trim() || undefined } as any,
    { enabled: debouncedExtra.trim().length > 0, staleTime: 5_000 }
  );

  const includedWeeksSignature = useMemo(
    () => (shoppingQuery.data?.includedWeekStarts ?? (shoppingQuery.data?.weekStart ? [shoppingQuery.data.weekStart] : [])).join("|"),
    [shoppingQuery.data?.includedWeekStarts, shoppingQuery.data?.weekStart]
  );

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const item of shoppingQuery.data?.items ?? []) {
      for (const occurrence of item.occurrences ?? []) {
        const key = `${occurrence.weekStart}::${occurrence.dayIndex}::${item.ingredientId}::${item.unit ?? ""}`;
        next[key] = occurrence.checked ?? false;
      }
    }
    setCheckedByOccurrence(next);
  }, [includedWeeksSignature, shoppingQuery.data?.items]);

  const items = shoppingQuery.data?.items ?? [];
  const extrasAll = ((shoppingQuery.data as any)?.extras ?? []) as Array<{ id: string; name: string; weekStart: string; checked: boolean }>;
  const extras = extrasAll.filter((e: { weekStart: string }) => e.weekStart === (shoppingQuery.data?.weekStart ?? activeWeekStart));
  const isLoading = shoppingQuery.isLoading;
  const isFetching = shoppingQuery.isFetching;

  const occurrenceOptions = useMemo(() => {
    const map = new Map<
      string,
      { key: string; weekdayLabel: string; shortLabel: string; longLabel: string; dateISO: string }
    >();
    for (const item of items) {
      if (item.isPantryItem) continue;
      for (const occurrence of item.occurrences ?? []) {
        const key = `${occurrence.weekStart}::${occurrence.dayIndex}`;
        if (!map.has(key)) {
          map.set(key, {
            key,
            weekdayLabel: occurrence.weekdayLabel,
            shortLabel: occurrence.shortLabel,
            longLabel: occurrence.longLabel,
            dateISO: occurrence.dateISO,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  }, [items]);

  useEffect(() => {
    const optionKeys = occurrenceOptions.map((option) => option.key);
    setVisibleDayKeys((prev) => {
      if (optionKeys.length === 0) return [];
      const prevSet = new Set(prev);
      const missing = optionKeys.some((key) => !prevSet.has(key));
      const extra = Array.from(prevSet).some((key) => !optionKeys.includes(key));
      if (prevSet.size === 0 || missing || extra) {
        return optionKeys;
      }
      return prev;
    });
  }, [occurrenceOptions]);

  const visibleDayKeySet = useMemo(() => new Set(visibleDayKeys), [visibleDayKeys]);

  const dayFilterLabel = useMemo(() => {
    if (occurrenceOptions.length === 0) return "Alle dager";
    if (visibleDayKeys.length === 0) return "Ingen dager";
    if (visibleDayKeys.length === occurrenceOptions.length) return "Alle dager";
    const selected = occurrenceOptions.filter((option) => visibleDayKeySet.has(option.key));
    if (selected.length === 0) return "Ingen dager";
    if (selected.length <= 2) {
      return selected.map((option) => option.weekdayLabel).join(", ");
    }
    return `${selected.length} dager`;
  }, [occurrenceOptions, visibleDayKeySet, visibleDayKeys.length]);

  const { regularItems, pantryItems } = useMemo(() => {
    const regularUnchecked: ShoppingListItem[] = [];
    const regularChecked: ShoppingListItem[] = [];
    const pantryUnchecked: ShoppingListItem[] = [];
    const pantryChecked: ShoppingListItem[] = [];

    for (const item of items) {
      const key = `${item.ingredientId}::${item.unit ?? ""}`;
      if (removedKeys.has(key)) continue;
      const occurrences = item.occurrences ?? [];
      const isItemChecked = occurrences.length
        ? occurrences.every((occurrence) => {
            const occKey = `${occurrence.weekStart}::${occurrence.dayIndex}::${item.ingredientId}::${item.unit ?? ""}`;
            return checkedByOccurrence[occKey] ?? occurrence.checked ?? false;
          })
        : item.checked ?? false;
      const targetUnchecked = item.isPantryItem ? pantryUnchecked : regularUnchecked;
      const targetChecked = item.isPantryItem ? pantryChecked : regularChecked;
      if (isItemChecked) targetChecked.push(item);
      else targetUnchecked.push(item);
    }

    return {
      regularItems: [...regularUnchecked, ...regularChecked],
      pantryItems: [...pantryUnchecked, ...pantryChecked],
    };
  }, [items, checkedByOccurrence, removedKeys]);

  const includedWeekLabels = useMemo(() => {
    const weeks = shoppingQuery.data?.includedWeekStarts ?? (shoppingQuery.data?.weekStart ? [shoppingQuery.data.weekStart] : []);
    return weeks;
  }, [shoppingQuery.data?.includedWeekStarts, shoppingQuery.data?.weekStart]);

  const updateShoppingItem = trpc.planner.updateShoppingItem.useMutation();
  const extraToggle = trpc.planner.extraToggle.useMutation();
  const extraRemove = trpc.planner.extraRemove.useMutation();
  const extraAdd = trpc.planner.extraAdd.useMutation();

  function getOccurrenceKey(item: ShoppingListItem, occurrence: ShoppingListOccurrence) {
    return `${occurrence.weekStart}::${occurrence.dayIndex}::${item.ingredientId}::${item.unit ?? ""}`;
  }

  function isOccurrenceChecked(item: ShoppingListItem, occurrence: ShoppingListOccurrence) {
    const key = getOccurrenceKey(item, occurrence);
    return checkedByOccurrence[key] ?? occurrence.checked ?? false;
  }

  function areAllOccurrencesChecked(item: ShoppingListItem) {
    const occurrences = item.occurrences ?? [];
    if (occurrences.length === 0) {
      return item.checked ?? false;
    }
    return occurrences.every((occurrence) => isOccurrenceChecked(item, occurrence));
  }

  function getPreviousCheckedOccurrence(item: ShoppingListItem, occurrence: ShoppingListOccurrence) {
    const occurrences = item.occurrences ?? [];
    let previous: ShoppingListOccurrence | null = null;
    for (const candidate of occurrences) {
      const candidateKey = `${candidate.weekStart}::${candidate.dayIndex}`;
      const currentKey = `${occurrence.weekStart}::${occurrence.dayIndex}`;
      if (candidateKey === currentKey) {
        break;
      }
      if (isOccurrenceChecked(item, candidate)) {
        previous = candidate;
      }
    }
    return previous;
  }

  function toggleAllOccurrences(item: ShoppingListItem) {
    const occurrences = item.occurrences ?? [];
    const keys = occurrences.map((occurrence) => getOccurrenceKey(item, occurrence));
    const prevValues = keys.map((key) => checkedByOccurrence[key] ?? false);
    const nextValue = occurrences.some((occurrence) => !isOccurrenceChecked(item, occurrence));
    setCheckedByOccurrence((prev) => {
      const next = { ...prev };
      keys.forEach((key) => {
        next[key] = nextValue;
      });
      return next;
    });
    updateShoppingItem.mutate(
      {
        ingredientId: item.ingredientId,
        unit: item.unit ?? null,
        occurrences: occurrences.map((occurrence) => ({
          weekStart: occurrence.weekStart,
          dayIndex: occurrence.dayIndex,
        })),
        checked: nextValue,
      },
      {
        onError: () => {
          setCheckedByOccurrence((prev) => {
            const next = { ...prev };
            keys.forEach((key, index) => {
              next[key] = prevValues[index];
            });
            return next;
          });
        },
        onSuccess: () => {
          shoppingQuery.refetch().catch(() => undefined);
        },
      }
    );
  }

  function toggleSingleOccurrence(item: ShoppingListItem, occurrence: ShoppingListOccurrence) {
    const key = getOccurrenceKey(item, occurrence);
    const currentValue = checkedByOccurrence[key] ?? occurrence.checked ?? false;
    const nextValue = !currentValue;
    setCheckedByOccurrence((prev) => ({
      ...prev,
      [key]: nextValue,
    }));
    updateShoppingItem.mutate(
      {
        ingredientId: item.ingredientId,
        unit: item.unit ?? null,
        occurrences: [{ weekStart: occurrence.weekStart, dayIndex: occurrence.dayIndex }],
        checked: nextValue,
      },
      {
        onError: () => {
          setCheckedByOccurrence((prev) => ({
            ...prev,
            [key]: currentValue,
          }));
        },
        onSuccess: () => {
          shoppingQuery.refetch().catch(() => undefined);
        },
      }
    );
  }

  const daySections = useMemo<ShoppingListDaySection[]>(() => {
    const sections = new Map<
      string,
      ShoppingListDaySection & { dateISO: string }
    >();

    for (const item of regularItems) {
      const removalKey = `${item.ingredientId}::${item.unit ?? ""}`;
      if (removedKeys.has(removalKey)) continue;
      for (const occurrence of item.occurrences ?? []) {
        const sectionKey = `${occurrence.weekStart}::${occurrence.dayIndex}`;
        if (!visibleDayKeySet.has(sectionKey)) continue;
        if (!sections.has(sectionKey)) {
          sections.set(sectionKey, {
            key: sectionKey,
            weekdayLabel: occurrence.weekdayLabel,
            longLabel: occurrence.longLabel,
            entries: [],
            dateISO: occurrence.dateISO,
          });
        }
        sections.get(sectionKey)!.entries.push({ item, occurrence });
      }
    }

    return Array.from(sections.values())
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO))
      .map(({ dateISO: _date, entries, ...section }) => ({
        ...section,
        entries: [...entries].sort((a, b) =>
          a.item.name.localeCompare(b.item.name, "nb", { sensitivity: "base" })
        ),
      }));
  }, [regularItems, removedKeys, visibleDayKeySet]);

  function toggleDayKey(dayKey: string, checked: boolean) {
    setVisibleDayKeys((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(dayKey);
      } else {
        next.delete(dayKey);
      }
      return occurrenceOptions
        .map((option) => option.key)
        .filter((key) => next.has(key));
    });
  }

  function removeItem(item: ShoppingListItem) {
    const key = `${item.ingredientId}::${item.unit ?? ""}`;
    setRemovedKeys((prev) => new Set(prev).add(key));
    const occurrences = item.occurrences ?? [];
    const occurrencePayload = occurrences.map((occurrence) => ({
      weekStart: occurrence.weekStart,
      dayIndex: occurrence.dayIndex,
    }));
    const previousValues = occurrences.map((occurrence) => ({
      key: getOccurrenceKey(item, occurrence),
      value: isOccurrenceChecked(item, occurrence),
    }));
    if (occurrences.length > 0) {
      setCheckedByOccurrence((prev) => {
        const next = { ...prev };
        previousValues.forEach(({ key: occKey }) => {
          next[occKey] = true;
        });
        return next;
      });
    }
    // Mark as checked for selected occurrences so it's effectively dismissed
    updateShoppingItem.mutate(
      {
        ingredientId: item.ingredientId,
        unit: item.unit ?? null,
        occurrences: occurrencePayload.length ? occurrencePayload : undefined,
        weeks: occurrencePayload.length ? undefined : item.weekStarts ?? [activeWeekStart],
        checked: true,
      },
      {
        onError: () => {
          setRemovedKeys((prev) => {
            const copy = new Set(prev);
            copy.delete(key);
            return copy;
          });
          if (occurrences.length > 0) {
            setCheckedByOccurrence((prev) => {
              const next = { ...prev };
              previousValues.forEach(({ key: occKey, value }) => {
                next[occKey] = value;
              });
              return next;
            });
          }
        },
        onSuccess: () => {
          shoppingQuery.refetch().catch(() => undefined);
        },
      }
    );
  }

  async function addOrToggleExtra(name: string) {
    const clean = name.trim();
    if (!clean) return;
    // Ensure it's in catalog, then ensure it's present for active week (unchecked)
    try {
      if (!extraAdd.isPending) {
        await extraAdd.mutateAsync({ name: clean } as any);
      }
    } catch (_) {
      // ignore if already exists
    }
    await extraToggle.mutateAsync({ weekStart: activeWeekStart, name: clean, checked: false } as any);
    setExtraInput("");
    setIsAddExtraOpen(false);
    shoppingQuery.refetch().catch(() => undefined);
  }

  async function toggleExtra(name: string, checked: boolean) {
    await extraToggle.mutateAsync({ weekStart: activeWeekStart, name, checked: !checked } as any);
    shoppingQuery.refetch().catch(() => undefined);
  }

  async function removeExtra(name: string) {
    await extraRemove.mutateAsync({ weekStart: activeWeekStart, name } as any);
    shoppingQuery.refetch().catch(() => undefined);
  }

  function renderAlphabeticalItems(list: ShoppingListItem[]) {
    return list.map((item) => {
      const key = `${item.ingredientId}::${item.unit ?? ""}`;
      if (removedKeys.has(key)) return null;
      const checked = areAllOccurrencesChecked(item);
      const quantityLabel =
        item.totalQuantity != null && item.unit !== null
          ? formatQuantity(item.totalQuantity, item.unit)
          : item.totalQuantity != null
            ? formatQuantity(item.totalQuantity, null)
            : null;

      return (
        <li key={key} className={`border rounded-lg p-3 bg-white ${checked ? "opacity-75" : ""}`}>
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={checked}
              onChange={() => toggleAllOccurrences(item)}
              aria-label={`Marker ${item.name} som kjøpt`}
            />
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <div className="flex items-baseline gap-2 flex-wrap">
                <div className={`font-medium ${checked ? "text-gray-500" : "text-gray-900"}`}>{item.name}</div>
                <div className={`text-xs ${checked ? "text-gray-400" : "text-gray-700"}`}>
                  {quantityLabel ?? "Mengde ikke spesifisert"}
                  {item.hasMissingQuantities && quantityLabel ? " • noen mengder mangler" : null}
                </div>
              </div>
              {item.details.length ? (
                <div className="flex flex-wrap gap-2 w-full">
                  {item.details.map((detail, index) => {
                    const detailLabel =
                      detail.quantity != null
                        ? formatQuantity(detail.quantity, detail.unit ?? item.unit)
                        : undefined;
                  const hsl = FALL_BADGE_PALETTE[index % FALL_BADGE_PALETTE.length];
                    return (
                      <Badge
                        key={`${detail.recipeId}-${index}`}
                        className={`border-0 text-[11px] font-medium text-white ${checked ? "opacity-70" : ""}`}
                        style={{ backgroundColor: `hsl(${hsl})` }}
                      >
                        {detail.recipeName}
                        {detailLabel ? ` – ${detailLabel}` : ""}
                      </Badge>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-red-600 shrink-0 self-center"
              aria-label={`Fjern ${item.name} fra handlelisten`}
              onClick={() => removeItem(item)}
              title={`Fjern ${item.name}`}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </li>
      );
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-center">Handleliste</h1>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant={includeNextWeek ? "default" : "outline"}
            size="sm"
            onClick={() => setIncludeNextWeek((prev) => !prev)}
            aria-pressed={includeNextWeek}
          >
            {includeNextWeek ? "Fjern neste ukes plan" : "Inkluder neste ukes plan"}
          </Button>
          {isFetching && <span className="text-xs text-gray-500">Oppdaterer…</span>}
        </div>
        <div className="flex flex-wrap items-center gap-3 justify-end">
          <Select value={viewMode} onValueChange={(value) => setViewMode(value as "by-day" | "alphabetical")}>
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue placeholder="Velg visning" />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="by-day">Etter ukesplan</SelectItem>
              <SelectItem value="alphabetical">Alfabetisk</SelectItem>
            </SelectContent>
          </Select>
          {viewMode === "by-day" && occurrenceOptions.length > 0 ? (
            <DayFilterDropdown
              label={dayFilterLabel}
              options={occurrenceOptions}
              selectedKeys={visibleDayKeySet}
              onToggle={toggleDayKey}
              onSelectAll={() => setVisibleDayKeys(occurrenceOptions.map((option) => option.key))}
              onSelectNone={() => setVisibleDayKeys([])}
            />
          ) : null}
          <Dialog open={isAddExtraOpen} onOpenChange={setIsAddExtraOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm">Legg til element</Button>
            </DialogTrigger>
            <DialogContent className="isolate z-[2000] bg-white dark:bg-neutral-900 text-foreground max-sm:w-[calc(100vw-2rem)] max-sm:mx-auto sm:max-w-md sm:max-h-[min(100vh-4rem,32rem)] sm:shadow-2xl sm:ring-1 sm:ring-border sm:rounded-xl max-sm:bg-background max-sm:!left-1/2 max-sm:!top-[calc(env(safe-area-inset-top)+1rem)] max-sm:!h-[50dvh] max-sm:!max-h-[50dvh] max-sm:!-translate-x-1/2 max-sm:!translate-y-0 max-sm:!rounded-2xl max-sm:!border-0 max-sm:!shadow-none max-sm:p-6">
              <div className="flex h-full min-h-0 flex-col">
                <DialogHeader className="sm:px-0 sm:pt-0">
                  <div className="mb-3 flex items-center justify-between">
                    <Button
                      type="button"
                      size="sm"
                      disabled={!extraInput.trim()}
                      onClick={() => addOrToggleExtra(extraInput.trim())}
                    >
                      Legg til
                    </Button>
                    <DialogClose asChild>
                      <Button type="button" variant="ghost" size="icon" aria-label="Lukk">
                        <X className="h-4 w-4" />
                      </Button>
                    </DialogClose>
                  </div>
                  <DialogTitle>Legg til i handlelisten</DialogTitle>
                  <DialogDescription className="max-sm:hidden">Skriv inn et element. Tidligere elementer dukker opp som forslag.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 max-sm:flex-1 max-sm:min-h-0 max-sm:overflow-y-auto">
                  <Input
                    className="focus-visible:ring-inset"
                    autoFocus
                    placeholder="F.eks. vaskemiddel"
                    value={extraInput}
                    onChange={(e) => setExtraInput(e.target.value)}
                  />
                  {extraInput.trim().length > 0 && (
                    <div className="min-h-6">
                      {extraSuggest.isLoading ? (
                        <p className="text-xs text-muted-foreground">Søker…</p>
                      ) : (
                        (() => {
                          const suggestions = (extraSuggest.data ?? []) as Array<{ id: string; name: string }>;
                          const exists = suggestions.some((s) => s.name.toLowerCase() === extraInput.trim().toLowerCase());
                          return (
                            <div className="flex flex-wrap gap-2">
                              {suggestions.map((s) => (
                                <Badge key={s.id} className="cursor-pointer" onClick={() => addOrToggleExtra(s.name)}>
                                  {s.name}
                                </Badge>
                              ))}
                              {!exists && (
                                <Badge className="cursor-pointer" onClick={() => addOrToggleExtra(extraInput.trim())}>
                                  Legg til "{extraInput.trim()}"
                                </Badge>
                              )}
                            </div>
                          );
                        })()
                      )}
                    </div>
                  )}
                </div>
                {/* Footer removed - primary action is in header */}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {includeNextWeek && includedWeekLabels.length ? (
        <p className="text-xs text-gray-500">Viser varer for {includedWeekLabels.join(" og ")}.</p>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-gray-500">Laster handleliste…</p>
      ) : !regularItems.length && !pantryItems.length ? (
        <p className="text-sm text-gray-500">Ingen oppskrifter valgt for denne uken ennå.</p>
      ) : (
        <div className="max-w-2xl mx-auto w-full">
          {viewMode === "alphabetical" ? (
            <ul className="space-y-3">{renderAlphabeticalItems(regularItems)}</ul>
          ) : (
            <ShoppingListDayView
              sections={daySections}
              getOccurrenceKey={getOccurrenceKey}
              isOccurrenceChecked={isOccurrenceChecked}
              getPreviousCheckedOccurrence={getPreviousCheckedOccurrence}
              onToggleOccurrence={toggleSingleOccurrence}
              onRemoveItem={removeItem}
              removedKeys={removedKeys}
            />
          )}
          {/* Extras section */}
          <div className="my-6">
            <Separator className="my-4" />
            <h2 className="text-sm font-semibold mb-2">Andre ting</h2>
            {extras.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ingen egne elementer ennå.</p>
            ) : (
              <ul className="space-y-3">
                {extras.map((e: { id: string; name: string; checked: boolean }) => (
                  <li key={e.id} className="border rounded-lg p-3 bg-white">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        checked={e.checked}
                        onChange={() => toggleExtra(e.name, e.checked)}
                        aria-label={`Marker ${e.name} som kjøpt`}
                      />
                      <div className={`flex-1 ${e.checked ? "text-gray-400" : "text-gray-900"}`}>{e.name}</div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-600 shrink-0"
                        onClick={() => removeExtra(e.name)}
                        aria-label={`Fjern ${e.name}`}
                        title={`Fjern ${e.name}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="my-6">
            <Separator className="my-4" />
            <h2 className="text-sm font-semibold mb-2">Sjekk at du har dette:</h2>
            {pantryItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ingen basisvarer i ukesplanen.</p>
            ) : (
              <ul className="space-y-3">{renderAlphabeticalItems(pantryItems)}</ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
