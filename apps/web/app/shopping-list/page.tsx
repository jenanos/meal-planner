"use client";
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@repo/ui";
import { ChevronDown, ChevronRight, ChevronUp, X } from "lucide-react";
import {
  ShoppingListDayView,
  type ShoppingListDaySection,
} from "./components/shopping-list-day-view";
import { FALL_BADGE_PALETTE, formatQuantity } from "./utils";
import type { ShoppingListItem, ShoppingListOccurrence } from "./types";
import { WeekSelector } from "../planner/components/WeekSelector";
import { deriveWeekLabel, startOfWeekISO } from "../../lib/week";
import type { TimelineWeekEntry } from "../planner/types";
import type { MockWeekTimelineResult } from "../../lib/mock/store";
import { ALL_DAY_NAMES } from "../planner/utils";

const EMPTY_ITEMS: ShoppingListItem[] = [];

export default function ShoppingListPage() {
  const currentWeekStart = useMemo(() => startOfWeekISO(), []);
  const [activeWeekStart, setActiveWeekStart] = useState(currentWeekStart);
  const [includeNextWeek, setIncludeNextWeek] = useState(false);
  const [startDay, setStartDay] = useState(0);
  const [viewMode, setViewMode] = useState<"by-day" | "alphabetical">("by-day");
  const [checkedByOccurrence, setCheckedByOccurrence] = useState<Record<string, boolean>>({});
  const [visibleDayKeys, setVisibleDayKeys] = useState<string[]>([]);
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(new Set());
  const [expandedDetailsKeys, setExpandedDetailsKeys] = useState<Set<string>>(new Set());
  const previousOptionKeysRef = useRef<string[]>([]);
  // Extras UI state
  const [isAddExtraOpen, setIsAddExtraOpen] = useState(false);
  const [extraInput, setExtraInput] = useState("");
  const [debouncedExtra, setDebouncedExtra] = useState("");
  const [showCompletedExtras, setShowCompletedExtras] = useState(false);

  const shoppingQuery = trpc.planner.shoppingList.useQuery({
    weekStart: activeWeekStart,
    includeNextWeek,
  });

  const timelineQuery = trpc.planner.weekTimeline.useQuery({ around: currentWeekStart });

  useEffect(() => {
    setRemovedKeys(new Set());
  }, [activeWeekStart]);

  const timelineWeeks = useMemo(() => {
    const rawWeeks = timelineQuery.data?.weeks ?? [];
    const weeks = rawWeeks as MockWeekTimelineResult["weeks"];
    return weeks.map((week) => ({
      ...week,
      label: deriveWeekLabel(week.weekStart, currentWeekStart),
    }));
  }, [timelineQuery.data, currentWeekStart]);

  const timelineEntries = useMemo<TimelineWeekEntry[]>(
    () => timelineWeeks.map((week, index) => ({ week, index })),
    [timelineWeeks]
  );

  const activeWeekIndex = timelineWeeks.findIndex((week) => week.weekStart === activeWeekStart);

  const handleSelectWeek = useCallback((weekStart: string) => {
    setActiveWeekStart(weekStart);
  }, []);

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

  const items = shoppingQuery.data?.items ?? EMPTY_ITEMS;

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const item of items) {
      for (const occurrence of item.occurrences ?? []) {
        const key = getOccurrenceKey(item, occurrence);
        next[key] = occurrence.checked ?? false;
      }
    }
    setCheckedByOccurrence(next);
  }, [includedWeeksSignature, items]);
  const extrasAll = ((shoppingQuery.data as any)?.extras ?? []) as Array<{ id: string; name: string; weekStart: string; checked: boolean }>;
  const extras = useMemo(() => {
    // Extras are shared across weeks — deduplicate by name, preferring unchecked
    const byName = new Map<string, { id: string; name: string; weekStart: string; checked: boolean }>();
    for (const e of extrasAll) {
      const existing = byName.get(e.name);
      if (!existing || (!e.checked && existing.checked)) {
        byName.set(e.name, e);
      }
    }
    return Array.from(byName.values());
  }, [extrasAll]);

  const uncheckedExtras = useMemo(() => extras.filter((e) => !e.checked), [extras]);
  const checkedExtras = useMemo(() => extras.filter((e) => e.checked).slice(-20), [extras]);
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
      if (optionKeys.length === 0) {
        return [];
      }
      if (prev.length === 0) {
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);
        const upcomingKeys = occurrenceOptions
          .filter((option) => {
            const optionDate = new Date(option.dateISO);
            if (Number.isNaN(optionDate.getTime())) {
              console.warn(
                `[ShoppingList] Invalid dateISO encountered: "${option.dateISO}" for option key "${option.key}". Excluding from upcomingKeys.`
              );
              return false;
            }
            optionDate.setUTCHours(0, 0, 0, 0);
            return optionDate >= todayStart;
          })
          .map((option) => option.key);

        return upcomingKeys.length > 0 ? upcomingKeys : optionKeys;
      }
      const prevSet = new Set(prev);
      const filtered = optionKeys.filter((key) => prevSet.has(key));
      if (filtered.length === 0) {
        return optionKeys;
      }
      const previousOptionKeys = previousOptionKeysRef.current;
      const previouslySelectedAll =
        previousOptionKeys.length > 0 &&
        prev.length === previousOptionKeys.length &&
        previousOptionKeys.every((key, index) => key === prev[index]);
      if (previouslySelectedAll && filtered.length !== optionKeys.length) {
        return optionKeys;
      }
      return filtered;
    });
    previousOptionKeysRef.current = optionKeys;
  }, [occurrenceOptions]);

  const visibleDayKeySet = useMemo(() => new Set(visibleDayKeys), [visibleDayKeys]);

  const dayFilterLabel = useMemo(() => {
    if (occurrenceOptions.length === 0) return "Alle";
    if (visibleDayKeys.length === 0) return "Ingen";
    if (visibleDayKeys.length === occurrenceOptions.length) return "Alle";
    const selected = occurrenceOptions.filter((option) => visibleDayKeySet.has(option.key));
    if (selected.length === 0) return "Ingen";
    if (selected.length <= 3) {
      return selected.map((option) => option.weekdayLabel.substring(0, 3)).join(", ");
    }
    return `${selected.length} dager`;
  }, [occurrenceOptions, visibleDayKeySet, visibleDayKeys.length]);

  const startDayLabel = ALL_DAY_NAMES[startDay];
  const viewModeLabel = viewMode === "by-day" ? "Ukesplan" : "Alfabetisk";
  const settingsLabel = `${viewModeLabel}${viewMode === "by-day" ? ` · ${dayFilterLabel}` : ""
    }${startDay !== 0 ? ` · Fra ${startDayLabel.toLowerCase()}` : ""}${includeNextWeek ? " · Neste uke" : ""}`;

  const { regularItems, pantryItems } = useMemo(() => {
    const regularUnchecked: ShoppingListItem[] = [];
    const regularChecked: ShoppingListItem[] = [];
    const pantryUnchecked: ShoppingListItem[] = [];
    const pantryChecked: ShoppingListItem[] = [];

    for (const item of items) {
      const key = `${item.ingredientId}::${item.unit ?? ""}`;
      if (removedKeys.has(key)) continue;
      const isItemChecked = areAllOccurrencesChecked(item);
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

  function getFirstCheckedOccurrence(item: ShoppingListItem, occurrence: ShoppingListOccurrence) {
    const entries = item.firstCheckedOccurrences ?? [];
    const match = entries.find((entry) => entry.weekStart === occurrence.weekStart);
    if (!match) return null;
    if (match.dayIndex === occurrence.dayIndex) return null;
    if (occurrence.dayIndex <= match.dayIndex) return null;
    return (item.occurrences ?? []).find(
      (candidate) =>
        candidate.weekStart === match.weekStart && candidate.dayIndex === match.dayIndex
    ) ?? null;
  }

  function toggleDetails(key: string) {
    setExpandedDetailsKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
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
      ShoppingListDaySection & { dateISO: string; recipeNameSet: Set<string> }
    >();

    for (const item of regularItems) {
      const removalKey = `${item.ingredientId}::${item.unit ?? ""}`;
      if (removedKeys.has(removalKey)) continue;

      const recipeNamesByOccurrence = new Map<string, string[]>();
      for (const detail of item.details ?? []) {
        const occurrenceKey = `${detail.weekStart}::${detail.dayIndex}`;
        if (!recipeNamesByOccurrence.has(occurrenceKey)) {
          recipeNamesByOccurrence.set(occurrenceKey, []);
        }
        recipeNamesByOccurrence.get(occurrenceKey)!.push(detail.recipeName);
      }

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
            recipeNames: [],
            recipeNameSet: new Set<string>(),
          });
        }
        const section = sections.get(sectionKey)!;
        section.entries.push({ item, occurrence });
        const matchingRecipeNames = recipeNamesByOccurrence.get(sectionKey);
        if (matchingRecipeNames) {
          for (const recipeName of matchingRecipeNames) {
            section.recipeNameSet.add(recipeName);
          }
        }
      }
    }

    return Array.from(sections.values())
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO))
      .map(({ dateISO: _date, entries, recipeNameSet, ...section }) => ({
        ...section,
        recipeNames: Array.from(recipeNameSet),
        entries: [...entries].sort((a, b) => {
          const aChecked = isOccurrenceChecked(a.item, a.occurrence);
          const bChecked = isOccurrenceChecked(b.item, b.occurrence);
          if (aChecked !== bChecked) {
            return aChecked ? 1 : -1;
          }
          return a.item.name.localeCompare(b.item.name, "nb", { sensitivity: "base" });
        }),
      }));
  }, [regularItems, removedKeys, visibleDayKeySet, checkedByOccurrence]);

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
      const isExpanded = expandedDetailsKeys.has(key);
      const showDetailsToggle = item.details.length > 0;
      const detailBadges = item.details.map((detail, index) => {
        const detailLabel =
          detail.quantity != null ? formatQuantity(detail.quantity, detail.unit ?? item.unit) : undefined;
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
      });
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
                <>
                  <div className="hidden md:flex flex-wrap gap-2 w-full">{detailBadges}</div>
                  {isExpanded ? (
                    <div className="flex md:hidden flex-wrap gap-2 w-full">{detailBadges}</div>
                  ) : null}
                </>
              ) : null}
            </div>
            {showDetailsToggle ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="md:hidden text-gray-500 shrink-0 self-center"
                aria-label={
                  isExpanded
                    ? `Skjul detaljer for ${item.name} i handlelisten`
                    : `Vis detaljer for ${item.name} i handlelisten`
                }
                onClick={() => toggleDetails(key)}
                title={isExpanded ? "Skjul detaljer" : "Vis detaljer"}
              >
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            ) : null}
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
      <h1 className="hidden text-xl font-bold text-center md:block">Handleliste</h1>

      <WeekSelector
        weeks={timelineEntries}
        activeWeekStart={activeWeekStart}
        activeWeekIndex={activeWeekIndex}
        onSelectWeek={handleSelectWeek}
      />

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-row sm:items-center sm:justify-between">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto justify-between gap-2">
                {settingsLabel}
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-72 max-h-[70vh] overflow-y-auto">
              <DropdownMenuLabel>Visning</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={viewMode}
                onValueChange={(value) => setViewMode(value as "by-day" | "alphabetical")}
              >
                <DropdownMenuRadioItem value="by-day">Ukesplan</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="alphabetical">Alfabetisk</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Startdag</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={String(startDay)}
                onValueChange={(v) => setStartDay(Number(v))}
              >
                {ALL_DAY_NAMES.map((name, i) => (
                  <DropdownMenuRadioItem key={i} value={String(i)}>
                    {name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={includeNextWeek}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => setIncludeNextWeek((prev) => !prev)}
              >
                Inkluder neste uke
              </DropdownMenuCheckboxItem>
              {viewMode === "by-day" && occurrenceOptions.length > 0 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Vis dager</DropdownMenuLabel>
                  {occurrenceOptions.map((option) => (
                    <DropdownMenuCheckboxItem
                      key={option.key}
                      checked={visibleDayKeySet.has(option.key)}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={(checked) => toggleDayKey(option.key, Boolean(checked))}
                    >
                      {option.weekdayLabel} ({option.shortLabel})
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={visibleDayKeys.length === occurrenceOptions.length}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => setVisibleDayKeys(occurrenceOptions.map((option) => option.key))}
                  >
                    Velg alle dager
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={visibleDayKeys.length === 0}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => setVisibleDayKeys([])}
                  >
                    Velg ingen dager
                  </DropdownMenuCheckboxItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="w-full justify-self-end sm:w-auto sm:justify-self-end sm:ml-auto">
            <Dialog open={isAddExtraOpen} onOpenChange={setIsAddExtraOpen}>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  className="w-full sm:w-auto bg-emerald-500 text-white hover:bg-emerald-600 focus-visible:ring-emerald-600"
                >
                  Legg til element
                </Button>
              </DialogTrigger>
              <DialogContent className="isolate z-[2000] bg-white dark:bg-neutral-900 text-foreground max-sm:w-[calc(100vw-2rem)]max-sm:mx-auto sm:max-w-md sm:max-h-[min(100vh-4rem,32rem)] sm:shadow-2xl sm:ring-1 sm:ring-border sm:rounded-xl max-sm:bg-background max-sm:!left-1/2 max-sm:!top-[calc(env(safe-area-inset-top)+1rem)] max-sm:!h-[50dvh] max-sm:!max-h-[50dvh] max-sm:!-translate-x-1/2 max-sm:!translate-y-0 max-sm:!rounded-2xl max-sm:!border-0 max-sm:!shadow-none max-sm:p-6">
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
                    <DialogDescription className="max-sm:hidden">
                      Skriv inn et element. Tidligere elementer dukker opp som forslag.
                    </DialogDescription>
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
        <div className="flex items-center gap-3 justify-end">
          {isFetching && <span className="text-xs text-gray-500">Oppdaterer…</span>}
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
        <div className="max-w-2xl mx-auto w-full space-y-6">
          <section className="rounded-2xl border border-emerald-200/60 bg-emerald-50/40 p-4">
            <h2 className="text-sm font-semibold mb-2">Egne elementer</h2>
            {uncheckedExtras.length === 0 && checkedExtras.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ingen egne elementer ennå.</p>
            ) : (
              <div className="space-y-3">
                {uncheckedExtras.length > 0 && (
                  <ul className="space-y-3">
                    {uncheckedExtras.map((e) => (
                      <li key={e.id} className="border rounded-lg p-3 bg-white">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            className="h-5 w-5"
                            checked={false}
                            onChange={() => toggleExtra(e.name, e.checked)}
                            aria-label={`Marker ${e.name} som kjøpt`}
                          />
                          <div className="flex-1 text-gray-900">{e.name}</div>
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
                {checkedExtras.length > 0 && (
                  <div>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowCompletedExtras((prev) => !prev)}
                      aria-label={showCompletedExtras ? "Skjul fullførte elementer" : "Vis fullførte elementer"}
                    >
                      {showCompletedExtras ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      {checkedExtras.length} fullført{checkedExtras.length !== 1 ? "e" : ""}
                    </button>
                    {showCompletedExtras && (
                      <ul className="space-y-3 mt-2">
                        {checkedExtras.map((e) => (
                          <li key={e.id} className="border rounded-lg p-3 bg-white opacity-75">
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                className="h-5 w-5"
                                checked={true}
                                onChange={() => toggleExtra(e.name, e.checked)}
                                aria-label={`Marker ${e.name} som ikke kjøpt`}
                              />
                              <div className="flex-1 text-gray-400">{e.name}</div>
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
                )}
              </div>
            )}
          </section>
          <section className="rounded-2xl border border-orange-200/60 bg-orange-50/40 p-4">
            <h2 className="text-sm font-semibold mb-2">Ukesplan</h2>
            {viewMode === "alphabetical" ? (
              <ul className="space-y-3">{renderAlphabeticalItems(regularItems)}</ul>
            ) : (
              <ShoppingListDayView
                sections={daySections}
                getOccurrenceKey={getOccurrenceKey}
                isOccurrenceChecked={isOccurrenceChecked}
                getFirstCheckedOccurrence={getFirstCheckedOccurrence}
                onToggleOccurrence={toggleSingleOccurrence}
                onRemoveItem={removeItem}
                removedKeys={removedKeys}
              />
            )}
          </section>
          <section className="rounded-2xl border border-slate-200/70 bg-slate-50/50 p-4">
            <h2 className="text-sm font-semibold mb-2">Basisvarer</h2>
            {pantryItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ingen basisvarer i ukesplanen.</p>
            ) : (
              <ul className="space-y-3">{renderAlphabeticalItems(pantryItems)}</ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
