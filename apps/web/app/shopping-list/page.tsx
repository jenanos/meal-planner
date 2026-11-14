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
} from "@repo/ui";
import { ChevronDown, ChevronRight, ChevronUp, X } from "lucide-react";
import {
  ShoppingListDayView,
  type ShoppingListDaySection,
} from "./components/shopping-list-day-view";
import {
  ShoppingListCategoryView,
  type ShoppingListCategorySection,
} from "./components/shopping-list-category-view";
import { ShoppingListDayGridView } from "./components/shopping-list-day-grid-view";
import { ShoppingListCategoryGridView } from "./components/shopping-list-category-grid-view";
import { ShoppingListGridItem } from "./components/shopping-list-grid-item";
import { ShoppingListDisplayModal } from "./components/ShoppingListDisplayModal";
import { FALL_BADGE_PALETTE, formatQuantity } from "./utils";
import type { ShoppingListItem, ShoppingListOccurrence } from "./types";
import {
  ShoppingListWindowBar,
  type ShoppingListWindowDay,
} from "./components/shopping-list-window-bar";
import {
  DEFAULT_SHOPPING_HORIZON,
  SHOPPING_HORIZON_LABELS,
  ingredientCategoryLabel,
  isShoppingHorizon,
  normalizeCategoryOrder,
  type IngredientCategory,
  type ShoppingHorizon,
  type ShoppingViewMode,
  type ShoppingDisplayStyle,
} from "../../lib/shopping";
import { localTodayMs, resolveShoppingWindow } from "../../lib/shopping-window";
import {
  readShoppingSession,
  writeShoppingSession,
} from "../../lib/shopping-session";

const EMPTY_ITEMS: ShoppingListItem[] = [];
const CHECKED_EXTRAS_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;

type ShoppingStore = {
  id: string;
  name: string;
  categoryOrder: string[];
  isDefault: boolean;
};

type ShoppingUserSettings = {
  defaultViewMode: ShoppingViewMode;
  defaultDisplayStyle: ShoppingDisplayStyle;
  shoppingHorizon?: ShoppingHorizon;
  showPantryWithIngredients: boolean;
  compactShoppingList?: boolean;
  defaultStoreId: string | null;
};

const DEFAULT_USER_SETTINGS: ShoppingUserSettings = {
  defaultViewMode: "by-day",
  defaultDisplayStyle: "list",
  shoppingHorizon: DEFAULT_SHOPPING_HORIZON,
  showPantryWithIngredients: false,
  defaultStoreId: null,
};

export default function ShoppingListPage() {
  // The list always starts today. Re-read the date when the page comes back
  // into view so a tab left open overnight rolls over to the new day.
  const [todayMs, setTodayMs] = useState(() => localTodayMs());
  useEffect(() => {
    const refresh = () => setTodayMs(localTodayMs());
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const [horizon, setHorizon] = useState<ShoppingHorizon>(
    DEFAULT_SHOPPING_HORIZON,
  );
  const shoppingWindow = useMemo(
    () => resolveShoppingWindow(todayMs, horizon),
    [todayMs, horizon],
  );
  const currentWeekStart = shoppingWindow.weekStartISO;
  // Earlier days this week are hidden unless asked for; never persisted, so
  // every visit starts from today again.
  const [showPastDays, setShowPastDays] = useState(false);
  const [hiddenDayKeys, setHiddenDayKeys] = useState<string[]>([]);
  const [isDisplayModalOpen, setIsDisplayModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ShoppingViewMode>("by-day");
  const [displayStyle, setDisplayStyle] = useState<ShoppingDisplayStyle>("list");
  const [showPantryWithIngredients, setShowPantryWithIngredients] =
    useState(false);
  const [stores, setStores] = useState<ShoppingStore[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [activeSettings, setActiveSettings] =
    useState<ShoppingUserSettings>(DEFAULT_USER_SETTINGS);
  const [defaultsHydrated, setDefaultsHydrated] = useState(false);
  const [checkedByOccurrence, setCheckedByOccurrence] = useState<
    Record<string, boolean>
  >({});
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(new Set());
  const [expandedDetailsKeys, setExpandedDetailsKeys] = useState<Set<string>>(
    new Set(),
  );
  // Extras UI state
  const [isAddExtraOpen, setIsAddExtraOpen] = useState(false);
  const [extraInput, setExtraInput] = useState("");
  const [debouncedExtra, setDebouncedExtra] = useState("");
  const [showCompletedExtras, setShowCompletedExtras] = useState(false);
  // Compact mode drops the framed sections and their headings so the list
  // reads as one continuous list and nothing below the first block is missed.
  const compact = Boolean(activeSettings.compactShoppingList);

  const shoppingSettingsQuery = trpc.planner.shoppingSettings.useQuery(
    undefined,
    {
      staleTime: 60_000,
    },
  );

  useEffect(() => {
    const data = shoppingSettingsQuery.data as
      | {
        settings: ShoppingUserSettings;
        stores: ShoppingStore[];
      }
      | undefined;
    if (!data) return;

    const nextStores = (data.stores ?? []).map((store) => ({
      ...store,
      categoryOrder: normalizeCategoryOrder(store.categoryOrder),
    }));
    setStores(nextStores);

    const userSettings = data.settings ?? DEFAULT_USER_SETTINGS;

    const fallbackStoreId =
      userSettings.defaultStoreId ??
      nextStores.find((store) => store.isDefault)?.id ??
      nextStores[0]?.id ??
      null;

    if (!defaultsHydrated) {
      const session = readShoppingSession();
      const sessionStoreId =
        session && nextStores.some((store) => store.id === session.selectedStoreId)
          ? session.selectedStoreId
          : null;

      setViewMode(session?.viewMode ?? userSettings.defaultViewMode ?? "by-day");
      setDisplayStyle(
        session?.displayStyle ?? userSettings.defaultDisplayStyle ?? "list",
      );
      setHorizon(
        session?.horizon ??
          (isShoppingHorizon(userSettings.shoppingHorizon)
            ? userSettings.shoppingHorizon
            : DEFAULT_SHOPPING_HORIZON),
      );
      setShowPantryWithIngredients(
        session
          ? Boolean(session.showPantryWithIngredients)
          : Boolean(userSettings.showPantryWithIngredients),
      );
      setSelectedStoreId(sessionStoreId ?? fallbackStoreId);

      setActiveSettings(userSettings);

      // Day keys start with their week's ISO date, so hidden days from weeks
      // that have passed can be dropped by comparing the strings.
      const thisWeek = resolveShoppingWindow(localTodayMs(), "today").weekStartISO;
      setHiddenDayKeys(
        (session?.hiddenDayKeys ?? []).filter((key) => key >= thisWeek),
      );
      setDefaultsHydrated(true);
    } else {
      setActiveSettings(userSettings);
      setSelectedStoreId((current) =>
        current && nextStores.some((store) => store.id === current)
          ? current
          : fallbackStoreId,
      );
    }
  }, [shoppingSettingsQuery.data, defaultsHydrated]);

  const sessionWriteSeededRef = useRef(false);

  useEffect(() => {
    if (!defaultsHydrated) return;
    // Skip the first run after hydration so we don't refresh the 24h timer
    // when the user merely opened the page without changing anything.
    if (!sessionWriteSeededRef.current) {
      sessionWriteSeededRef.current = true;
      return;
    }

    writeShoppingSession({
      viewMode,
      displayStyle,
      horizon,
      showPantryWithIngredients,
      hiddenDayKeys,
      selectedStoreId,
    });
  }, [
    defaultsHydrated,
    viewMode,
    displayStyle,
    horizon,
    showPantryWithIngredients,
    hiddenDayKeys,
    selectedStoreId,
  ]);

  // Whole weeks are fetched (the current one plus as many as the horizon
  // reaches into); the day window below narrows them down to the days shown.
  const shoppingQuery = trpc.planner.shoppingList.useQuery(
    {
      weekStart: currentWeekStart,
      lookaheadWeeks: shoppingWindow.lookaheadWeeks,
    } as any,
    { placeholderData: (previous: any) => previous },
  );

  // Suggest extras based on input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedExtra(extraInput), 250);
    return () => clearTimeout(t);
  }, [extraInput]);

  const extraSuggest = trpc.planner.extraSuggest.useQuery(
    { search: debouncedExtra.trim() || undefined } as any,
    { enabled: debouncedExtra.trim().length > 0, staleTime: 5_000 },
  );

  const packageSuggest = trpc.planner.packageSuggest.useQuery(
    { search: debouncedExtra.trim() || undefined } as any,
    { enabled: debouncedExtra.trim().length > 0, staleTime: 5_000 },
  );

  const packageExpand = trpc.planner.packageExpand.useMutation();

  const includedWeeksSignature = useMemo(
    () =>
      (
        shoppingQuery.data?.includedWeekStarts ??
        (shoppingQuery.data?.weekStart ? [shoppingQuery.data.weekStart] : [])
      ).join("|"),
    [shoppingQuery.data?.includedWeekStarts, shoppingQuery.data?.weekStart],
  );

  const rawItems = shoppingQuery.data?.items ?? EMPTY_ITEMS;
  const plannedDays = (shoppingQuery.data as any)?.plannedDays as
    | {
      weekStart: string;
      dayIndex: number;
      recipeName: string | null;
      entryType: string;
      dateISO: string;
      weekdayLabel: string;
      longLabel: string;
      shortLabel: string;
    }[]
    | undefined;

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const item of rawItems) {
      for (const occurrence of item.occurrences ?? []) {
        const key = getOccurrenceKey(item, occurrence);
        next[key] = occurrence.checked ?? false;
      }
    }
    setCheckedByOccurrence(next);
  }, [includedWeeksSignature, rawItems]);
  const extrasAll = ((shoppingQuery.data as any)?.extras ?? []) as Array<{
    id: string;
    name: string;
    weekStart: string;
    checked: boolean;
    updatedAt: string;
    category: string | null;
    hasCategory: boolean;
  }>;
  const extras = useMemo(() => {
    // Extras are shared across weeks — deduplicate by name, preferring unchecked
    const byName = new Map<
      string,
      {
        id: string;
        name: string;
        weekStart: string;
        checked: boolean;
        updatedAt: string;
        category: string | null;
        hasCategory: boolean;
      }
    >();
    for (const e of extrasAll) {
      const existing = byName.get(e.name);
      if (!existing || (!e.checked && existing.checked)) {
        byName.set(e.name, e);
      }
    }
    return Array.from(byName.values());
  }, [extrasAll]);
  const categorizedExtras = useMemo(() => {
    const cutoff = new Date(Date.now() - CHECKED_EXTRAS_WINDOW_MS);
    return extras.filter(
      (e) =>
        Boolean(e.category) &&
        (!e.checked || new Date(e.updatedAt) >= cutoff),
    );
  }, [extras]);
  const extrasForTopSection = useMemo(
    () =>
      viewMode === "by-category"
        ? extras.filter((e) => !e.category)
        : extras,
    [extras, viewMode],
  );
  const uncheckedExtras = useMemo(
    () => extrasForTopSection.filter((e) => !e.checked),
    [extrasForTopSection],
  );
  const checkedExtras = useMemo(
    () => {
      const cutoff = new Date(Date.now() - CHECKED_EXTRAS_WINDOW_MS);
      return extrasForTopSection.filter(
        (e) => e.checked && new Date(e.updatedAt) >= cutoff,
      );
    },
    [extrasForTopSection],
  );
  const isLoading = shoppingQuery.isLoading;
  const isFetching = shoppingQuery.isFetching;

  // Every planned day in the fetched weeks, oldest first.
  const allDayOptions = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        weekdayLabel: string;
        shortLabel: string;
        longLabel: string;
        dateISO: string;
        dateMs: number;
      }
    >();
    const add = (source: {
      weekStart: string;
      dayIndex: number;
      weekdayLabel: string;
      shortLabel: string;
      longLabel: string;
      dateISO: string;
    }) => {
      const key = `${source.weekStart}::${source.dayIndex}`;
      if (map.has(key)) return;
      map.set(key, {
        key,
        weekdayLabel: source.weekdayLabel,
        shortLabel: source.shortLabel,
        longLabel: source.longLabel,
        dateISO: source.dateISO,
        dateMs: new Date(source.dateISO).getTime(),
      });
    };
    for (const item of rawItems) {
      for (const occurrence of item.occurrences ?? []) add(occurrence);
    }
    // Include planned days so days with recipes but no ingredients still appear
    for (const pd of plannedDays ?? []) add(pd);
    return Array.from(map.values()).sort((a, b) => a.dateMs - b.dateMs);
  }, [rawItems, plannedDays]);

  const hasPastDays = useMemo(
    () => allDayOptions.some((option) => option.dateMs < shoppingWindow.todayMs),
    [allDayOptions, shoppingWindow.todayMs],
  );

  // The days the list can cover: from today (or from Monday when earlier days
  // are shown) through the end of the horizon.
  const occurrenceOptions = useMemo(() => {
    const startMs = showPastDays
      ? shoppingWindow.weekStartMs
      : shoppingWindow.todayMs;
    return allDayOptions.filter(
      (option) => option.dateMs >= startMs && option.dateMs <= shoppingWindow.endMs,
    );
  }, [allDayOptions, showPastDays, shoppingWindow]);

  const visibleDayKeySet = useMemo(() => {
    const hidden = new Set(hiddenDayKeys);
    return new Set(
      occurrenceOptions
        .map((option) => option.key)
        .filter((key) => !hidden.has(key)),
    );
  }, [occurrenceOptions, hiddenDayKeys]);

  const windowDays = useMemo<ShoppingListWindowDay[]>(
    () =>
      occurrenceOptions.map((option) => ({
        key: option.key,
        label:
          option.dateMs === shoppingWindow.todayMs
            ? "I dag"
            : `${option.weekdayLabel.substring(0, 3)} ${option.shortLabel}`,
        title: option.longLabel,
        selected: visibleDayKeySet.has(option.key),
        isPast: option.dateMs < shoppingWindow.todayMs,
      })),
    [occurrenceOptions, visibleDayKeySet, shoppingWindow.todayMs],
  );

  // Narrow every item down to the visible days, so quantities and checkmarks
  // in all three views describe exactly what this shopping trip covers.
  const items = useMemo(() => {
    const result: ShoppingListItem[] = [];
    for (const item of rawItems) {
      const occurrences = (item.occurrences ?? []).filter((occurrence) =>
        visibleDayKeySet.has(`${occurrence.weekStart}::${occurrence.dayIndex}`),
      );
      if (!occurrences.length) continue;
      const hasQuantity = occurrences.some(
        (occurrence) => occurrence.quantity != null,
      );
      result.push({
        ...item,
        occurrences,
        details: (item.details ?? []).filter((detail) =>
          visibleDayKeySet.has(`${detail.weekStart}::${detail.dayIndex}`),
        ),
        weekStarts: Array.from(
          new Set(occurrences.map((occurrence) => occurrence.weekStart)),
        ),
        totalQuantity: hasQuantity
          ? occurrences.reduce(
              (sum, occurrence) => sum + (occurrence.quantity ?? 0),
              0,
            )
          : null,
        hasMissingQuantities: occurrences.some(
          (occurrence) => occurrence.hasMissingQuantities,
        ),
      });
    }
    return result;
  }, [rawItems, visibleDayKeySet]);

  const rawItemsByKey = useMemo(() => {
    const map = new Map<string, ShoppingListItem>();
    for (const item of rawItems) {
      map.set(`${item.ingredientId}::${item.unit ?? ""}`, item);
    }
    return map;
  }, [rawItems]);

  const { regularItems, pantryItems } = useMemo(() => {
    const regularUnchecked: ShoppingListItem[] = [];
    const regularChecked: ShoppingListItem[] = [];
    const pantryUnchecked: ShoppingListItem[] = [];
    const pantryChecked: ShoppingListItem[] = [];

    for (const item of items) {
      const key = `${item.ingredientId}::${item.unit ?? ""}`;
      if (removedKeys.has(key)) continue;
      const isItemChecked = areAllOccurrencesChecked(item);
      const targetUnchecked = item.isPantryItem
        ? pantryUnchecked
        : regularUnchecked;
      const targetChecked = item.isPantryItem ? pantryChecked : regularChecked;
      if (isItemChecked) targetChecked.push(item);
      else targetUnchecked.push(item);
    }

    return {
      regularItems: [...regularUnchecked, ...regularChecked],
      pantryItems: [...pantryUnchecked, ...pantryChecked],
    };
  }, [items, checkedByOccurrence, removedKeys]);

  const updateShoppingItem = trpc.planner.updateShoppingItem.useMutation();
  const extraToggle = trpc.planner.extraToggle.useMutation();
  const extraRemove = trpc.planner.extraRemove.useMutation();
  const extraAdd = trpc.planner.extraAdd.useMutation();

  function getOccurrenceKey(
    item: ShoppingListItem,
    occurrence: ShoppingListOccurrence,
  ) {
    return `${occurrence.weekStart}::${occurrence.dayIndex}::${item.ingredientId}::${item.unit ?? ""}`;
  }

  function isOccurrenceChecked(
    item: ShoppingListItem,
    occurrence: ShoppingListOccurrence,
  ) {
    const key = getOccurrenceKey(item, occurrence);
    return checkedByOccurrence[key] ?? occurrence.checked ?? false;
  }

  function areAllOccurrencesChecked(item: ShoppingListItem) {
    const occurrences = item.occurrences ?? [];
    if (occurrences.length === 0) {
      return item.checked ?? false;
    }
    return occurrences.every((occurrence) =>
      isOccurrenceChecked(item, occurrence),
    );
  }

  function getFirstCheckedOccurrence(
    item: ShoppingListItem,
    occurrence: ShoppingListOccurrence,
  ) {
    const entries = item.firstCheckedOccurrences ?? [];
    const match = entries.find(
      (entry) => entry.weekStart === occurrence.weekStart,
    );
    if (!match) return null;
    if (match.dayIndex === occurrence.dayIndex) return null;
    if (occurrence.dayIndex <= match.dayIndex) return null;
    // The day it was bought on may lie outside the visible window.
    const source =
      rawItemsByKey.get(`${item.ingredientId}::${item.unit ?? ""}`) ?? item;
    return (
      (source.occurrences ?? []).find(
        (candidate) =>
          candidate.weekStart === match.weekStart &&
          candidate.dayIndex === match.dayIndex,
      ) ?? null
    );
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
    const keys = occurrences.map((occurrence) =>
      getOccurrenceKey(item, occurrence),
    );
    const prevValues = keys.map((key) => checkedByOccurrence[key] ?? false);
    const nextValue = occurrences.some(
      (occurrence) => !isOccurrenceChecked(item, occurrence),
    );
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
      },
    );
  }

  function toggleSingleOccurrence(
    item: ShoppingListItem,
    occurrence: ShoppingListOccurrence,
  ) {
    const key = getOccurrenceKey(item, occurrence);
    const currentValue =
      checkedByOccurrence[key] ?? occurrence.checked ?? false;
    const nextValue = !currentValue;
    setCheckedByOccurrence((prev) => ({
      ...prev,
      [key]: nextValue,
    }));
    updateShoppingItem.mutate(
      {
        ingredientId: item.ingredientId,
        unit: item.unit ?? null,
        occurrences: [
          { weekStart: occurrence.weekStart, dayIndex: occurrence.dayIndex },
        ],
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
      },
    );
  }

  const buildDaySections = useCallback(
    (sourceItems: ShoppingListItem[], seedPlannedDays = false): ShoppingListDaySection[] => {
      const sections = new Map<
        string,
        ShoppingListDaySection & { dateISO: string; recipeNameSet: Set<string> }
      >();

      // Seed sections from plannedDays so days with recipes but no ingredients
      // still appear in the shopping list.
      if (seedPlannedDays && plannedDays) {
        for (const pd of plannedDays) {
          const sectionKey = `${pd.weekStart}::${pd.dayIndex}`;
          if (!visibleDayKeySet.has(sectionKey)) continue;
          if (!sections.has(sectionKey)) {
            sections.set(sectionKey, {
              key: sectionKey,
              weekdayLabel: pd.weekdayLabel,
              longLabel: pd.longLabel,
              entries: [],
              dateISO: pd.dateISO,
              recipeNames: [],
              recipeNameSet: new Set<string>(),
            });
          }
          const section = sections.get(sectionKey)!;
          if (pd.recipeName) {
            section.recipeNameSet.add(pd.recipeName);
          }
        }
      }

      for (const item of sourceItems) {
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
            return a.item.name.localeCompare(b.item.name, "nb", {
              sensitivity: "base",
            });
          }),
        }));
    },
    [
      plannedDays,
      removedKeys,
      visibleDayKeySet,
      checkedByOccurrence,
    ],
  );

  const displayedItems = useMemo(
    () => {
      if (!showPantryWithIngredients) {
        return regularItems;
      }

      const mergedItems = [...regularItems, ...pantryItems];
      const uncheckedItems = mergedItems.filter(
        (item) => !areAllOccurrencesChecked(item),
      );
      const checkedItems = mergedItems.filter((item) =>
        areAllOccurrencesChecked(item),
      );

      return [...uncheckedItems, ...checkedItems];
    },
    [showPantryWithIngredients, regularItems, pantryItems, checkedByOccurrence],
  );

  const daySections = useMemo<ShoppingListDaySection[]>(
    () => buildDaySections(displayedItems, true),
    [buildDaySections, displayedItems],
  );

  const pantryDaySections = useMemo<ShoppingListDaySection[]>(
    () => buildDaySections(pantryItems),
    [buildDaySections, pantryItems],
  );

  const activeStore = useMemo(() => {
    if (!stores.length) return null;
    return (
      stores.find((store) => store.id === selectedStoreId) ??
      stores.find((store) => store.isDefault) ??
      stores[0]
    );
  }, [stores, selectedStoreId]);

  const activeCategoryOrder = useMemo<IngredientCategory[]>(
    () => normalizeCategoryOrder(activeStore?.categoryOrder),
    [activeStore],
  );

  function buildCategorySections(
    sourceItems: ShoppingListItem[],
    extraEntries: Array<{
      id: string;
      name: string;
      checked: boolean;
      category: string | null;
    }> = [],
  ): ShoppingListCategorySection[] {
    const categories = new Map<
      IngredientCategory,
      ShoppingListCategorySection["entries"]
    >();

    activeCategoryOrder.forEach((category) => {
      categories.set(category, []);
    });

    for (const item of sourceItems) {
      const key = `${item.ingredientId}::${item.unit ?? ""}`;
      if (removedKeys.has(key)) continue;

      const occurrences = (item.occurrences ?? []).filter((occurrence) =>
        visibleDayKeySet.has(`${occurrence.weekStart}::${occurrence.dayIndex}`),
      );
      if (!occurrences.length) continue;

      const hasQuantity = occurrences.some(
        (occurrence) => occurrence.quantity != null,
      );
      const quantity = hasQuantity
        ? occurrences.reduce(
          (sum, occurrence) => sum + (occurrence.quantity ?? 0),
          0,
        )
        : null;
      const hasMissingQuantities = occurrences.some(
        (occurrence) => occurrence.hasMissingQuantities,
      );
      const checked = occurrences.every((occurrence) =>
        isOccurrenceChecked(item, occurrence),
      );

      const rawCategory = (item as { category?: string }).category ?? "ANNET";
      const category =
        (normalizeCategoryOrder([rawCategory])[0] ?? "ANNET") as IngredientCategory;
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      const quantityLabel =
        quantity != null
          ? formatQuantity(quantity, item.unit ?? null)
          : "Mengde ikke spesifisert";
      const extraInfo =
        hasMissingQuantities && quantity != null
          ? " • noen mengder mangler"
          : undefined;
      categories.get(category)!.push({
        key,
        name: item.name,
        quantityLabel,
        extraInfo,
        checked,
        onToggle: () => toggleCategoryOccurrences(item, occurrences),
        onRemove: () => removeItem(item),
      });
    }

    for (const extra of extraEntries) {
      if (!extra.category) continue;

      const category =
        (normalizeCategoryOrder([extra.category])[0] ??
          "ANNET") as IngredientCategory;
      if (!categories.has(category)) {
        categories.set(category, []);
      }

      categories.get(category)!.push({
        key: `extra::${extra.id}`,
        name: extra.name,
        quantityLabel: "Eget element",
        checked: extra.checked,
        onToggle: () => {
          void toggleExtra(extra.name, extra.checked);
        },
        onRemove: () => {
          void removeExtra(extra.name);
        },
      });
    }

    return activeCategoryOrder.map((category) => ({
      key: category,
      label: ingredientCategoryLabel(category),
      entries: (categories.get(category) ?? []).sort((a, b) => {
        if (a.checked !== b.checked) return a.checked ? 1 : -1;
        return a.name.localeCompare(b.name, "nb", {
          sensitivity: "base",
        });
      }),
    }));
  }

  // No planned meals at all inside the window (before any day is tapped off).
  const nothingPlanned = occurrenceOptions.length === 0;

  const categorySections = buildCategorySections(displayedItems, categorizedExtras);

  const pantryCategorySections = buildCategorySections(pantryItems);

  function toggleCategoryOccurrences(
    item: ShoppingListItem,
    occurrences: ShoppingListOccurrence[],
  ) {
    if (!occurrences.length) return;

    const keys = occurrences.map((occurrence) => getOccurrenceKey(item, occurrence));
    const prevValues = keys.map((key) => checkedByOccurrence[key] ?? false);
    const nextValue = occurrences.some(
      (occurrence) => !isOccurrenceChecked(item, occurrence),
    );

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
      },
    );
  }

  function toggleDayKey(dayKey: string, selected: boolean) {
    setHiddenDayKeys((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.delete(dayKey);
      } else {
        next.add(dayKey);
      }
      return Array.from(next);
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
        weeks: occurrencePayload.length
          ? undefined
          : (item.weekStarts ?? [currentWeekStart]),
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
      },
    );
  }

  async function addPackageToList(packageId: string) {
    try {
      await packageExpand.mutateAsync({
        packageId,
        weekStart: currentWeekStart,
      } as any);
      setExtraInput("");
      setIsAddExtraOpen(false);
      shoppingQuery.refetch().catch(() => undefined);
    } catch (_) {
      // ignore errors
    }
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
    await extraToggle.mutateAsync({
      weekStart: currentWeekStart,
      name: clean,
      checked: false,
    } as any);
    setExtraInput("");
    setIsAddExtraOpen(false);
    shoppingQuery.refetch().catch(() => undefined);
  }

  async function toggleExtra(name: string, checked: boolean) {
    await extraToggle.mutateAsync({
      weekStart: currentWeekStart,
      name,
      checked: !checked,
    } as any);
    shoppingQuery.refetch().catch(() => undefined);
  }

  async function removeExtra(name: string) {
    await extraRemove.mutateAsync({ weekStart: currentWeekStart, name } as any);
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
      });
      const quantityLabel =
        item.totalQuantity != null && item.unit !== null
          ? formatQuantity(item.totalQuantity, item.unit)
          : item.totalQuantity != null
            ? formatQuantity(item.totalQuantity, null)
            : null;

      return (
        <li
          key={key}
          className={`border rounded-lg p-3 bg-white ${checked ? "opacity-75" : ""}`}
        >
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
                <div
                  className={`font-medium ${checked ? "text-gray-500" : "text-gray-900"}`}
                >
                  {item.name}
                </div>
                <div
                  className={`text-xs ${checked ? "text-gray-400" : "text-gray-700"}`}
                >
                  {quantityLabel ?? "Mengde ikke spesifisert"}
                  {item.hasMissingQuantities && quantityLabel
                    ? " • noen mengder mangler"
                    : null}
                </div>
              </div>
              {item.details.length ? (
                <>
                  <div className="hidden md:flex flex-wrap gap-2 w-full">
                    {detailBadges}
                  </div>
                  {isExpanded ? (
                    <div className="flex md:hidden flex-wrap gap-2 w-full">
                      {detailBadges}
                    </div>
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
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
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

  function renderAlphabeticalGrid(list: ShoppingListItem[]) {
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
        <ShoppingListGridItem
          key={key}
          name={item.name}
          quantityLabel={quantityLabel}
          checked={checked}
          onToggle={() => toggleAllOccurrences(item)}
          onRemove={() => removeItem(item)}
        />
      );
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="hidden text-xl font-bold text-center md:block">
        Handleliste
      </h1>

      <ShoppingListWindowBar
        horizon={horizon}
        onHorizonChange={setHorizon}
        days={windowDays}
        onToggleDay={toggleDayKey}
        hasPastDays={hasPastDays}
        showPastDays={showPastDays}
        onShowPastDaysChange={setShowPastDays}
      />

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full sm:w-auto justify-between gap-2"
            onClick={() => setIsDisplayModalOpen(true)}
          >
            Visningsvalg
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </Button>

          <ShoppingListDisplayModal
            open={isDisplayModalOpen}
            onOpenChange={setIsDisplayModalOpen}
            viewMode={viewMode}
            setViewMode={setViewMode}
            displayStyle={displayStyle}
            setDisplayStyle={setDisplayStyle}
            showPantryWithIngredients={showPantryWithIngredients}
            setShowPantryWithIngredients={setShowPantryWithIngredients}
            stores={stores.map((store) => ({ id: store.id, name: store.name }))}
            selectedStoreId={selectedStoreId}
            setSelectedStoreId={(storeId) => setSelectedStoreId(storeId)}
          />
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
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Lukk"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </DialogClose>
                    </div>
                    <DialogTitle>Legg til i handlelisten</DialogTitle>
                    <DialogDescription className="max-sm:hidden">
                      Skriv inn et element. Tidligere elementer dukker opp som
                      forslag.
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
                        {extraSuggest.isLoading ||
                          packageSuggest.isLoading ? (
                          <p className="text-xs text-muted-foreground">
                            Søker…
                          </p>
                        ) : (
                          (() => {
                            const suggestions = (extraSuggest.data ??
                              []) as Array<{
                                id: string;
                                name: string;
                                hasCategory: boolean;
                              }>;
                            const pkgSuggestions = (packageSuggest.data ??
                              []) as Array<{
                                id: string;
                                name: string;
                                itemCount: number;
                              }>;
                            const exists = suggestions.some(
                              (s) =>
                                s.name.toLowerCase() ===
                                extraInput.trim().toLowerCase(),
                            ) || pkgSuggestions.some(
                              (p) =>
                                p.name.toLowerCase() ===
                                extraInput.trim().toLowerCase(),
                            );
                            return (
                              <div className="flex flex-wrap gap-2">
                                {pkgSuggestions.map((p) => (
                                  <Badge
                                    asChild
                                    key={`pkg-${p.id}`}
                                    className="cursor-pointer border border-blue-500 bg-blue-500 text-white hover:bg-blue-600"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => addPackageToList(p.id)}
                                    >
                                      {p.name}{" "}
                                      <span className="ml-1 opacity-75 text-[10px]">
                                        ({p.itemCount})
                                      </span>
                                    </button>
                                  </Badge>
                                ))}
                                {suggestions.map((s) => (
                                  <Badge
                                    key={s.id}
                                    className={`cursor-pointer border text-white ${s.hasCategory
                                        ? "border-emerald-500 bg-emerald-500 hover:bg-emerald-600"
                                        : "border-orange-500 bg-orange-500 hover:bg-orange-600"
                                      }`}
                                    onClick={() => addOrToggleExtra(s.name)}
                                  >
                                    {s.name}
                                  </Badge>
                                ))}
                                {!exists && (
                                  <Badge
                                    className="cursor-pointer border border-orange-500 bg-orange-500 text-white hover:bg-orange-600"
                                    onClick={() =>
                                      addOrToggleExtra(extraInput.trim())
                                    }
                                  >
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
          {isFetching && (
            <span className="text-xs text-gray-500">Oppdaterer…</span>
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Laster handleliste…</p>
      ) : (
        <div
          className={`max-w-2xl mx-auto w-full ${compact ? "space-y-3" : "space-y-6"}`}
        >
          {compact &&
            uncheckedExtras.length === 0 &&
            checkedExtras.length === 0 ? null : (
          <section
            className={
              compact
                ? undefined
                : "rounded-2xl border border-emerald-200/60 bg-emerald-50/40 p-4"
            }
          >
            {compact ? null : (
              <h2 className="text-sm font-semibold mb-2">
                {viewMode === "by-category"
                  ? "Egne elementer uten kategori"
                  : "Egne elementer"}
              </h2>
            )}
            {uncheckedExtras.length === 0 && checkedExtras.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {viewMode === "by-category"
                  ? "Ingen ukategoriserte egne elementer."
                  : "Ingen egne elementer ennå."}
              </p>
            ) : displayStyle === "grid" ? (
              <div className="space-y-3">
                {uncheckedExtras.length > 0 && (
                  <div className="grid grid-cols-4 gap-1.5">
                    {uncheckedExtras.map((e) => (
                      <ShoppingListGridItem
                        key={e.id}
                        name={e.name}
                        quantityLabel={null}
                        checked={false}
                        onToggle={() => toggleExtra(e.name, e.checked)}
                        onRemove={() => removeExtra(e.name)}
                      />
                    ))}
                  </div>
                )}
                {checkedExtras.length > 0 && (
                  <div>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowCompletedExtras((prev) => !prev)}
                      aria-label={
                        showCompletedExtras
                          ? "Skjul fullførte elementer"
                          : "Vis fullførte elementer"
                      }
                    >
                      {showCompletedExtras ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      {checkedExtras.length} fullført siste 5 dager
                    </button>
                    {showCompletedExtras && (
                      <div className="grid grid-cols-4 gap-1.5 mt-2">
                        {checkedExtras.map((e) => (
                          <ShoppingListGridItem
                            key={e.id}
                            name={e.name}
                            quantityLabel={null}
                            checked={true}
                            onToggle={() => toggleExtra(e.name, e.checked)}
                            onRemove={() => removeExtra(e.name)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
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
                            checked={e.checked}
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
                      aria-label={
                        showCompletedExtras
                          ? "Skjul fullførte elementer"
                          : "Vis fullførte elementer"
                      }
                    >
                      {showCompletedExtras ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      {checkedExtras.length} fullført siste 5 dager
                    </button>
                    {showCompletedExtras && (
                      <ul className="space-y-3 mt-2">
                        {checkedExtras.map((e) => (
                          <li
                            key={e.id}
                            className="border rounded-lg p-3 bg-white opacity-75"
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                className="h-5 w-5"
                                checked={e.checked}
                                onChange={() => toggleExtra(e.name, e.checked)}
                                aria-label={`Marker ${e.name} som ikke kjøpt`}
                              />
                              <div className="flex-1 text-gray-400">
                                {e.name}
                              </div>
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
          )}
          <section
            className={
              compact
                ? undefined
                : "rounded-2xl border border-orange-200/60 bg-orange-50/40 p-4"
            }
          >
            {compact ? null : (
              <h2 className="text-sm font-semibold mb-2">
                {viewMode === "by-day"
                  ? "Ukesplan"
                  : viewMode === "by-category"
                    ? `Kategorier${activeStore ? ` · ${activeStore.name}` : ""}`
                    : "Alfabetisk"}
              </h2>
            )}
            {nothingPlanned ? (
              <p className="text-sm text-muted-foreground">
                {horizon === "today"
                  ? "Ingen middag planlagt i dag."
                  : `Ingen middager planlagt for ${SHOPPING_HORIZON_LABELS[horizon].toLowerCase()}.`}
              </p>
            ) : displayStyle === "grid" ? (
              viewMode === "alphabetical" ? (
                <div className="grid grid-cols-4 gap-1.5">
                  {renderAlphabeticalGrid(displayedItems)}
                </div>
              ) : viewMode === "by-category" ? (
                <ShoppingListCategoryGridView
                  sections={categorySections}
                  emptyText="Ingen ingredienser eller kategoriserte egne elementer for valgte dager."
                />
              ) : (
                <ShoppingListDayGridView
                  sections={daySections}
                  getOccurrenceKey={getOccurrenceKey}
                  isOccurrenceChecked={isOccurrenceChecked}
                  onToggleOccurrence={toggleSingleOccurrence}
                  onRemoveItem={removeItem}
                  removedKeys={removedKeys}
                />
              )
            ) : viewMode === "alphabetical" ? (
              <ul className="space-y-3">
                {renderAlphabeticalItems(displayedItems)}
              </ul>
            ) : viewMode === "by-category" ? (
              <ShoppingListCategoryView
                sections={categorySections}
                emptyText="Ingen ingredienser eller kategoriserte egne elementer for valgte dager."
              />
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
          {!showPantryWithIngredients && !nothingPlanned ? (
            <section
              className={
                compact
                  ? "pt-3"
                  : "rounded-2xl border border-slate-200/70 bg-slate-50/50 p-4"
              }
            >
              <h2 className="text-sm font-semibold mb-2">Basisvarer</h2>
              {pantryItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ingen basisvarer for valgte dager.
                </p>
              ) : displayStyle === "grid" ? (
                viewMode === "alphabetical" ? (
                  <div className="grid grid-cols-4 gap-1.5">
                    {renderAlphabeticalGrid(pantryItems)}
                  </div>
                ) : viewMode === "by-category" ? (
                  <ShoppingListCategoryGridView
                    sections={pantryCategorySections}
                    emptyText="Ingen basisvarer for valgte dager."
                  />
                ) : (
                  <ShoppingListDayGridView
                    sections={pantryDaySections}
                    getOccurrenceKey={getOccurrenceKey}
                    isOccurrenceChecked={isOccurrenceChecked}
                    onToggleOccurrence={toggleSingleOccurrence}
                    onRemoveItem={removeItem}
                    removedKeys={removedKeys}
                  />
                )
              ) : viewMode === "alphabetical" ? (
                <ul className="space-y-3">{renderAlphabeticalItems(pantryItems)}</ul>
              ) : viewMode === "by-category" ? (
                <ShoppingListCategoryView
                  sections={pantryCategorySections}
                  emptyText="Ingen basisvarer for valgte dager."
                />
              ) : (
                <ShoppingListDayView
                  sections={pantryDaySections}
                  getOccurrenceKey={getOccurrenceKey}
                  isOccurrenceChecked={isOccurrenceChecked}
                  getFirstCheckedOccurrence={getFirstCheckedOccurrence}
                  onToggleOccurrence={toggleSingleOccurrence}
                  onRemoveItem={removeItem}
                  removedKeys={removedKeys}
                />
              )}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
