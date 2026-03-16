/* global globalThis */
import { EXTRA_CATALOG, INGREDIENTS as SEED_INGREDIENTS, RECIPES as SEED_RECIPES } from "./seed-data";
import type { SeedIngredientUsage, SeedRecipe } from "./seed-data";

const MS_PER_DAY = 86_400_000;
const MIN_DAY_INDEX = 0;
const MAX_DAY_INDEX = 6;

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("nb-NO", { weekday: "long" });
const WEEKDAY_WITH_DATE_FORMATTER = new Intl.DateTimeFormat("nb-NO", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("nb-NO", {
  day: "numeric",
  month: "numeric",
});

function capitalize(input: string) {
  if (!input) return input;
  return input.charAt(0).toUpperCase() + input.slice(1);
}

function hash32(str: string, seed: number) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x5bd1e995);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 15), 0x5bd1e995);
  h ^= h >>> 13;
  return h >>> 0;
}

function uuidFromString(str: string) {
  const a = hash32(str, 0x7f4a7c15).toString(16).padStart(8, "0");
  const b = hash32(str, 0x9e3779b9).toString(16).padStart(8, "0");
  const c = hash32(str, 0x85ebca6b).toString(16).padStart(8, "0");
  const d = hash32(str, 0xc2b2ae35).toString(16).padStart(8, "0");
  return `${a}-${b.slice(0, 4)}-${b.slice(4, 8)}-${c.slice(0, 4)}-${c.slice(4, 8)}${d}`;
}

type CryptoLike = { randomUUID?: () => string };

function resolveCrypto(): CryptoLike | undefined {
  if (typeof globalThis !== "undefined" && typeof (globalThis as any).crypto !== "undefined") {
    return (globalThis as any).crypto as CryptoLike;
  }
  return undefined;
}

function randomId(prefix: string) {
  const cryptoObj = resolveCrypto();
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }
  return uuidFromString(`${prefix}-${Date.now()}-${Math.random()}`);
}

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

function cleanName(name: string) {
  return name.trim();
}

function startOfWeekISO(input?: string | Date) {
  const date = input ? new Date(input) : new Date();
  if (Number.isNaN(date.getTime())) {
    return startOfWeekISO(new Date());
  }
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  utc.setUTCDate(utc.getUTCDate() + diff);
  utc.setUTCHours(0, 0, 0, 0);
  return utc.toISOString();
}

function addWeeksISO(weekStartISO: string, weeks: number) {
  const date = new Date(weekStartISO);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return startOfWeekISO(date);
}

function addDaysISO(iso: string, days: number) {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function describeDay(weekStart: string, dayIndex: number) {
  const dateISO = addDaysISO(weekStart, dayIndex);
  const date = new Date(dateISO);
  const weekdayLabel = capitalize(WEEKDAY_FORMATTER.format(date));
  const longLabel = capitalize(WEEKDAY_WITH_DATE_FORMATTER.format(date));
  const shortLabel = SHORT_DATE_FORMATTER.format(date);
  return {
    dateISO,
    weekdayLabel,
    longLabel,
    shortLabel,
  };
}

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function parseQuantity(quantity: string | number | undefined) {
  if (quantity == null) return null;
  if (typeof quantity === "number") return Number.isFinite(quantity) ? quantity : null;
  const trimmed = quantity.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

const INGREDIENT_CATEGORIES = [
  "FRUKT_OG_GRONT",
  "KJOTT",
  "OST",
  "BROD",
  "MEIERI_OG_EGG",
  "HERMETIKK",
  "TORRVARER",
  "BAKEVARER",
  "HUSHOLDNING",
  "ANNET",
] as const;

type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];
type ShoppingRole = "INGVILD" | "JENS";
type ShoppingViewMode = "by-day" | "alphabetical" | "by-category";

const STANDARD_STORE_NAME = "Standard butikk";
const STANDARD_CATEGORY_ORDER: IngredientCategory[] = [...INGREDIENT_CATEGORIES];
const DEFAULT_VISIBLE_DAY_INDICES = [0, 1, 2, 3, 4, 5, 6] as const;

function normalizeIngredientCategory(value: string | null | undefined): IngredientCategory {
  if (!value) return "ANNET";
  const upper = value.toUpperCase();
  if (upper === "UKATEGORISERT") return "ANNET";
  if (upper === "FRUKT" || upper === "GRONNSAKER") return "FRUKT_OG_GRONT";
  if (INGREDIENT_CATEGORIES.includes(upper as IngredientCategory)) {
    return upper as IngredientCategory;
  }
  return "ANNET";
}

function inferIngredientCategory(name: string): IngredientCategory {
  const normalized = normalizeName(name);
  const byName: Record<string, IngredientCategory> = {
    tomat: "FRUKT_OG_GRONT",
    løk: "FRUKT_OG_GRONT",
    "hvitløk": "FRUKT_OG_GRONT",
    paprika: "FRUKT_OG_GRONT",
    poteter: "FRUKT_OG_GRONT",
    torsk: "KJOTT",
    kylling: "KJOTT",
    storfekjøtt: "KJOTT",
    tortillalefser: "BROD",
    ris: "TORRVARER",
    bønner: "TORRVARER",
  };
  return byName[normalized] ?? "ANNET";
}

function sanitizeDayIndices(values: number[] | undefined) {
  const source = Array.isArray(values) ? values : [];
  const unique = Array.from(
    new Set(
      source
        .filter((value) => Number.isFinite(value))
        .map((value) => Math.max(MIN_DAY_INDEX, Math.min(MAX_DAY_INDEX, Math.trunc(value)))),
    ),
  ).sort((a, b) => a - b);
  if (!unique.length) {
    return [...DEFAULT_VISIBLE_DAY_INDICES];
  }
  return unique;
}

function normalizeCategoryOrder(values: string[] | undefined): IngredientCategory[] {
  const normalized: IngredientCategory[] = [];
  for (const value of values ?? []) {
    const category = normalizeIngredientCategory(value);
    if (!normalized.includes(category)) {
      normalized.push(category);
    }
  }
  for (const category of STANDARD_CATEGORY_ORDER) {
    if (!normalized.includes(category)) {
      normalized.push(category);
    }
  }
  return [...normalized.filter((category) => category !== "ANNET"), "ANNET"];
}

type IngredientRecord = {
  id: string;
  name: string;
  unit: string | null;
  isPantryItem: boolean;
  category: IngredientCategory;
  recipeIds: Set<string>;
};

type RecipeIngredientRecord = {
  ingredientId: string;
  name: string;
  unit: string | null;
  quantity: number | null;
  notes: string | null;
  isPantryItem: boolean;
  category: IngredientCategory;
};

type RecipeRecord = {
  id: string;
  name: string;
  description?: string;
  category: SeedRecipe["category"];
  everydayScore: number;
  healthScore: number;
  usageCount: number;
  lastUsed: string | null;
  ingredients: RecipeIngredientRecord[];
};

type WeekPlanRecord = {
  weekStart: string;
  entries: WeekPlanEntryRecord[];
  updatedAt: string | null;
};

type WeekPlanEntryRecord =
  | { type: "RECIPE"; recipeId: string }
  | { type: "TAKEAWAY" }
  | { type: "EMPTY" };

type ExtraCatalogRecord = { id: string; name: string };

type ExtraEntryRecord = { id: string; name: string; checked: boolean; catalogId: string; updatedAt: string };

type ShoppingStoreRecord = {
  id: string;
  name: string;
  categoryOrder: IngredientCategory[];
  isDefault: boolean;
};

type ShoppingRoleSettingsRecord = {
  role: ShoppingRole;
  defaultViewMode: ShoppingViewMode;
  startDay: number;
  includeNextWeek: boolean;
  showPantryWithIngredients: boolean;
  visibleDayIndices: number[];
  defaultStoreId: string | null;
};

type MockState = {
  ingredientsById: Map<string, IngredientRecord>;
  ingredientsByName: Map<string, IngredientRecord>;
  recipesById: Map<string, RecipeRecord>;
  extrasCatalogById: Map<string, ExtraCatalogRecord>;
  extrasCatalogByName: Map<string, ExtraCatalogRecord>;
  weekPlans: Map<string, WeekPlanRecord>;
  shoppingChecks: Map<string, boolean>;
  shoppingFirstChecked: Map<string, number>;
  extrasByWeek: Map<string, Map<string, ExtraEntryRecord>>;
  shoppingStores: Map<string, ShoppingStoreRecord>;
  shoppingRoleSettings: Map<ShoppingRole, ShoppingRoleSettingsRecord>;
  deviceRoles: Map<string, ShoppingRole>;
};

function createInitialState(): MockState {
  const ingredientsById = new Map<string, IngredientRecord>();
  const ingredientsByName = new Map<string, IngredientRecord>();

  function ensureIngredient(
    name: string,
    unit?: string | null,
    isPantryItem?: boolean,
    category?: string | null,
  ) {
    const normalized = normalizeName(name);
    let record = ingredientsByName.get(normalized);
    if (!record) {
      record = {
        id: uuidFromString(`ingredient:${normalized}`),
        name: cleanName(name),
        unit: unit?.trim() ?? null,
        isPantryItem: Boolean(isPantryItem),
        category: normalizeIngredientCategory(category ?? inferIngredientCategory(name)),
        recipeIds: new Set<string>(),
      };
      ingredientsByName.set(normalized, record);
      ingredientsById.set(record.id, record);
    } else {
      if (unit && !record.unit) {
        record.unit = unit.trim();
      }
      if (typeof isPantryItem === "boolean") {
        record.isPantryItem = isPantryItem;
      }
      if (category) {
        record.category = normalizeIngredientCategory(category);
      }
    }
    return record;
  }

  SEED_INGREDIENTS.forEach((ing) => {
    ensureIngredient(
      ing.name,
      ing.unit ?? null,
      ing.isPantryItem ?? false,
      (ing as { category?: string }).category ?? null,
    );
  });

  const recipesById = new Map<string, RecipeRecord>();

  function attachIngredients(recipeId: string, usages: SeedIngredientUsage[]): RecipeIngredientRecord[] {
    return usages.map((usage) => {
      const ingRecord = ensureIngredient(usage.name);
      const quantity = parseQuantity(usage.quantity);
      const unit = usage.unit?.trim() ?? ingRecord.unit ?? null;
      ingRecord.recipeIds.add(recipeId);
      return {
        ingredientId: ingRecord.id,
        name: ingRecord.name,
        unit,
        quantity,
        notes: usage.notes?.trim() ?? null,
        isPantryItem: ingRecord.isPantryItem,
        category: ingRecord.category,
      };
    });
  }

  SEED_RECIPES.forEach((recipe) => {
    const id = uuidFromString(`recipe:${normalizeName(recipe.name)}`);
    const lastUsed = recipe.lastUsedDaysAgo == null ? null : isoDaysAgo(recipe.lastUsedDaysAgo);
    const ingredients = attachIngredients(id, recipe.ingredients);
    recipesById.set(id, {
      id,
      name: recipe.name,
      description: recipe.description?.trim() || undefined,
      category: recipe.category,
      everydayScore: recipe.everydayScore,
      healthScore: recipe.healthScore,
      usageCount: recipe.usageCount ?? 0,
      lastUsed,
      ingredients,
    });
  });

  const extrasCatalogById = new Map<string, ExtraCatalogRecord>();
  const extrasCatalogByName = new Map<string, ExtraCatalogRecord>();
  EXTRA_CATALOG.forEach((name) => {
    const normalized = normalizeName(name);
    const record = { id: uuidFromString(`extra:${normalized}`), name: cleanName(name) };
    extrasCatalogById.set(record.id, record);
    extrasCatalogByName.set(normalized, record);
  });

  const standardStoreId = uuidFromString("shopping-store:standard");
  const shoppingStores = new Map<string, ShoppingStoreRecord>();
  shoppingStores.set(standardStoreId, {
    id: standardStoreId,
    name: STANDARD_STORE_NAME,
    categoryOrder: [...STANDARD_CATEGORY_ORDER],
    isDefault: true,
  });

  const shoppingRoleSettings = new Map<ShoppingRole, ShoppingRoleSettingsRecord>();
  (["INGVILD", "JENS"] as const).forEach((role) => {
    shoppingRoleSettings.set(role, {
      role,
      defaultViewMode: "by-day",
      startDay: 0,
      includeNextWeek: false,
      showPantryWithIngredients: false,
      visibleDayIndices: [...DEFAULT_VISIBLE_DAY_INDICES],
      defaultStoreId: standardStoreId,
    });
  });

  return {
    ingredientsById,
    ingredientsByName,
    recipesById,
    extrasCatalogById,
    extrasCatalogByName,
    weekPlans: new Map<string, WeekPlanRecord>(),
    shoppingChecks: new Map<string, boolean>(),
    shoppingFirstChecked: new Map<string, number>(),
    extrasByWeek: new Map<string, Map<string, ExtraEntryRecord>>(),
    shoppingStores,
    shoppingRoleSettings,
    deviceRoles: new Map<string, ShoppingRole>(),
  };
}

const state = createInitialState();

function ensureIngredient(
  name: string,
  unit?: string | null,
  isPantryItem?: boolean,
  category?: string | null,
) {
  const normalized = normalizeName(name);
  let record = state.ingredientsByName.get(normalized);
  if (!record) {
    record = {
      id: randomId("ingredient"),
      name: cleanName(name),
      unit: unit?.trim() ?? null,
      isPantryItem: Boolean(isPantryItem),
      category: normalizeIngredientCategory(category ?? inferIngredientCategory(name)),
      recipeIds: new Set<string>(),
    };
    state.ingredientsByName.set(normalized, record);
    state.ingredientsById.set(record.id, record);
  } else {
    if (unit && !record.unit) {
      record.unit = unit.trim();
    }
    if (typeof isPantryItem === "boolean") {
      record.isPantryItem = isPantryItem;
    }
    if (category) {
      record.category = normalizeIngredientCategory(category);
    }
  }
  return record;
}

function ensureExtraCatalog(name: string) {
  const normalized = normalizeName(name);
  let record = state.extrasCatalogByName.get(normalized);
  if (!record) {
    record = { id: randomId("extra"), name: cleanName(name) };
    state.extrasCatalogByName.set(normalized, record);
    state.extrasCatalogById.set(record.id, record);
  }
  return record;
}

function daysSinceLastUsed(iso: string | null) {
  if (!iso) return Number.POSITIVE_INFINITY;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - date.getTime()) / MS_PER_DAY);
}

function serializeRecipe(recipe: RecipeRecord) {
  return {
    id: recipe.id,
    name: recipe.name,
    description: recipe.description,
    category: recipe.category,
    everydayScore: recipe.everydayScore,
    healthScore: recipe.healthScore,
    usageCount: recipe.usageCount,
    lastUsed: recipe.lastUsed,
    ingredients: recipe.ingredients.map((ing) => ({
      ingredientId: ing.ingredientId,
      name: ing.name,
      unit: ing.unit ?? null,
      quantity: ing.quantity,
      notes: ing.notes,
      isPantryItem: ing.isPantryItem,
      category: ing.category,
    })),
  };
}

function getAllRecipes(): RecipeRecord[] {
  return Array.from(state.recipesById.values());
}

function getSuggestionRecords(kind: "longGap" | "frequent" | "search", options: { limit: number; exclude: Set<string>; search?: string }) {
  let list = getAllRecipes().filter((recipe) => !options.exclude.has(recipe.id));

  if (kind === "search") {
    const term = options.search?.trim();
    if (!term) {
      return [];
    }
    const q = term.toLowerCase();
    list = list.filter((recipe) => {
      const ingredients = recipe.ingredients.map((ing) => ing.name.toLowerCase()).join(" ");
      const haystack = `${recipe.name} ${recipe.description ?? ""} ${ingredients}`.toLowerCase();
      return haystack.includes(q);
    });
    list.sort((a, b) => a.name.localeCompare(b.name, "nb", { sensitivity: "base" }));
    return list.slice(0, options.limit);
  }

  if (kind === "longGap") {
    list.sort((a, b) => daysSinceLastUsed(b.lastUsed) - daysSinceLastUsed(a.lastUsed));
  } else if (kind === "frequent") {
    list.sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0));
  }

  return list.slice(0, options.limit);
}

function buildSuggestionBuckets(excludeIds: string[]) {
  const exclude = new Set(excludeIds);
  return {
    longGap: getSuggestionRecords("longGap", { limit: 7, exclude }).map(serializeRecipe),
    frequent: getSuggestionRecords("frequent", { limit: 7, exclude }).map(serializeRecipe),
  };
}

function generateWeekEntries(): WeekPlanEntryRecord[] {
  const all = getAllRecipes();
  if (!all.length) {
    return Array.from({ length: 7 }, () => ({ type: "EMPTY" } as WeekPlanEntryRecord));
  }

  // Fisher-Yates shuffle for unbiased randomness
  const pool = [...all];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const selected: string[] = [];
  const usedIds = new Set<string>();

  for (let day = 0; day < 7; day++) {
    // Pick a recipe not yet used this week
    const candidate = pool.find((r) => !usedIds.has(r.id));
    if (candidate) {
      selected.push(candidate.id);
      usedIds.add(candidate.id);
    } else {
      // Fallback: pick random from pool
      selected.push(pool[day % pool.length].id);
    }
  }

  return selected.map((recipeId) => ({
    type: "RECIPE",
    recipeId,
  }));
}

function ensureWeekPlan(weekStart: string) {
  const key = startOfWeekISO(weekStart);
  let plan = state.weekPlans.get(key);
  if (!plan) {
    plan = {
      weekStart: key,
      entries: Array.from({ length: 7 }, () => ({ type: "EMPTY" } as WeekPlanEntryRecord)),
      updatedAt: new Date().toISOString(),
    };
    state.weekPlans.set(key, plan);
  }
  return plan;
}

function serializeWeekPlan(plan: WeekPlanRecord) {
  const days = plan.entries.map((entry, index) => {
    if (entry.type === "RECIPE") {
      return {
        dayIndex: index,
        entryType: "RECIPE" as const,
        recipe: serializeRecipe(state.recipesById.get(entry.recipeId)!),
      };
    }
    if (entry.type === "TAKEAWAY") {
      return {
        dayIndex: index,
        entryType: "TAKEAWAY" as const,
        recipe: null,
      };
    }
    return {
      dayIndex: index,
      entryType: "EMPTY" as const,
      recipe: null,
    };
  });
  return {
    weekStart: plan.weekStart,
    updatedAt: plan.updatedAt,
    days,
    suggestions: buildSuggestionBuckets([]),
  };
}

function aggregateShopping(weekStarts: string[]) {
  type OccurrenceAccumulator = {
    weekStart: string;
    dayIndex: number;
    quantityTotal: number;
    hasQuantity: boolean;
    hasMissing: boolean;
  };

  type Accumulator = {
    ingredientId: string;
    name: string;
    unit: string | null;
    category: IngredientCategory;
    totalQuantity: number;
    hasQuantity: boolean;
    hasMissing: boolean;
    details: {
      recipeId: string;
      recipeName: string;
      quantity: number | null;
      unit: string | null;
      notes: string | null;
      weekStart: string;
      dayIndex: number;
    }[];
    weeks: Set<string>;
    isPantryItem: boolean;
    occurrences: Map<string, OccurrenceAccumulator>;
  };

  const accMap = new Map<string, Accumulator>();

  for (const week of weekStarts) {
    const plan = ensureWeekPlan(week);
    plan.entries.forEach((entry, dayIndex) => {
      if (entry.type !== "RECIPE") return;
      const recipe = state.recipesById.get(entry.recipeId);
      if (!recipe) return;
      recipe.ingredients.forEach((ing) => {
        const unitKey = ing.unit ?? "";
        const key = `${ing.ingredientId}::${unitKey}`;
        if (!accMap.has(key)) {
          accMap.set(key, {
            ingredientId: ing.ingredientId,
            name: ing.name,
            unit: ing.unit ?? null,
            category: ing.category,
            totalQuantity: 0,
            hasQuantity: false,
            hasMissing: false,
            details: [],
            weeks: new Set<string>(),
            isPantryItem: ing.isPantryItem,
            occurrences: new Map<string, OccurrenceAccumulator>(),
          });
        }
        const bucket = accMap.get(key)!;
        if (ing.isPantryItem) {
          bucket.isPantryItem = true;
        }
        bucket.category = normalizeIngredientCategory(ing.category);
        if (ing.quantity != null) {
          bucket.totalQuantity += ing.quantity;
          bucket.hasQuantity = true;
        } else {
          bucket.hasMissing = true;
        }
        bucket.details.push({
          recipeId: recipe.id,
          recipeName: recipe.name,
          quantity: ing.quantity,
          unit: ing.unit ?? null,
          notes: ing.notes,
          weekStart: week,
          dayIndex,
        });
        bucket.weeks.add(week);
        const occurrenceKey = `${week}::${dayIndex}`;
        if (!bucket.occurrences.has(occurrenceKey)) {
          bucket.occurrences.set(occurrenceKey, {
            weekStart: week,
            dayIndex,
            quantityTotal: 0,
            hasQuantity: false,
            hasMissing: false,
          });
        }
        const occurrenceBucket = bucket.occurrences.get(occurrenceKey)!;
        if (ing.quantity != null) {
          occurrenceBucket.quantityTotal += ing.quantity;
          occurrenceBucket.hasQuantity = true;
        } else {
          occurrenceBucket.hasMissing = true;
        }
      });
    });
  }

  const items = Array.from(accMap.values())
    .map((bucket) => {
      const weeks = Array.from(bucket.weeks.values());
      const unitKey = bucket.unit ?? "";
      const firstCheckedByWeek = new Map<string, number>();
      const occurrences = Array.from(bucket.occurrences.values())
        .map((occurrence) => {
          const dayKey = `${occurrence.weekStart}::${occurrence.dayIndex}::${bucket.ingredientId}::${unitKey}`;
          const weekKey = `${occurrence.weekStart}::${bucket.ingredientId}::${unitKey}`;
          const isChecked = Boolean(
            state.shoppingChecks.get(dayKey) ?? state.shoppingChecks.get(weekKey) ?? false
          );
          const firstCheckedDayIndex = state.shoppingFirstChecked.get(weekKey);
          if (typeof firstCheckedDayIndex === "number") {
            firstCheckedByWeek.set(occurrence.weekStart, firstCheckedDayIndex);
          }
          const { dateISO, weekdayLabel, longLabel, shortLabel } = describeDay(
            occurrence.weekStart,
            occurrence.dayIndex
          );
          return {
            weekStart: occurrence.weekStart,
            dayIndex: occurrence.dayIndex,
            dateISO,
            weekdayLabel,
            longLabel,
            shortLabel,
            quantity: occurrence.hasQuantity ? occurrence.quantityTotal : null,
            hasMissingQuantities: occurrence.hasMissing,
            checked: isChecked,
          };
        })
        .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
      const checked = occurrences.length ? occurrences.every((occ) => occ.checked) : false;
      const firstCheckedOccurrences = Array.from(firstCheckedByWeek.entries()).map(
        ([weekStart, dayIndex]) => ({ weekStart, dayIndex })
      );
      return {
        ingredientId: bucket.ingredientId,
        name: bucket.name,
        unit: bucket.unit,
        category: bucket.category,
        totalQuantity: bucket.hasQuantity ? bucket.totalQuantity : null,
        hasMissingQuantities: bucket.hasMissing,
        details: bucket.details,
        weekStarts: weeks,
        occurrences,
        checked,
        isPantryItem: bucket.isPantryItem,
        firstCheckedOccurrences,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "nb", { sensitivity: "base" }));

  // Return all extras (shared across weeks)
  const extras: { id: string; name: string; weekStart: string; checked: boolean; updatedAt: string }[] = [];
  state.extrasByWeek.forEach((entries, week) => {
    entries.forEach((entry) => {
      extras.push({ id: entry.id, name: entry.name, weekStart: week, checked: entry.checked, updatedAt: entry.updatedAt });
    });
  });

  // Build planned-days list so the client can show days even when a recipe
  // has no ingredients.
  const plannedDays: {
    weekStart: string;
    dayIndex: number;
    recipeName: string | null;
    entryType: string;
    dateISO: string;
    weekdayLabel: string;
    longLabel: string;
    shortLabel: string;
  }[] = [];
  for (const week of weekStarts) {
    const plan = ensureWeekPlan(week);
    plan.entries.forEach((entry, dayIndex) => {
      if (entry.type === "RECIPE") {
        const recipe = state.recipesById.get(entry.recipeId);
        const labels = describeDay(week, dayIndex);
        plannedDays.push({
          weekStart: week,
          dayIndex,
          recipeName: recipe?.name ?? null,
          entryType: "RECIPE",
          ...labels,
        });
      } else if (entry.type === "TAKEAWAY") {
        const labels = describeDay(week, dayIndex);
        plannedDays.push({
          weekStart: week,
          dayIndex,
          recipeName: null,
          entryType: "TAKEAWAY",
          ...labels,
        });
      }
    });
  }

  return { items, extras, plannedDays };
}

async function handleRecipeList(input: any) {
  const page = Number(input?.page ?? 1) || 1;
  const pageSize = Number(input?.pageSize ?? 20) || 20;
  const category = input?.category as SeedRecipe["category"] | undefined;
  const search = typeof input?.search === "string" ? input.search.trim().toLowerCase() : "";

  let list = getAllRecipes();
  if (category) {
    list = list.filter((recipe) => recipe.category === category);
  }
  if (search) {
    list = list.filter((recipe) => {
      const ingredients = recipe.ingredients.map((ing) => ing.name.toLowerCase()).join(" ");
      const haystack = `${recipe.name} ${recipe.description ?? ""} ${ingredients}`.toLowerCase();
      return haystack.includes(search);
    });
  }

  const total = list.length;
  const start = (page - 1) * pageSize;
  const items = list.slice(start, start + pageSize).map(serializeRecipe);
  return { total, page, pageSize, items };
}

async function handleRecipeCreate(input: any) {
  const name = cleanName(input?.name ?? "");
  if (!name) throw new Error("Navn er påkrevd");
  const id = randomId("recipe");
  const description = typeof input?.description === "string" && input.description.trim() ? input.description.trim() : undefined;
  const ingredientsInput: SeedIngredientUsage[] = Array.isArray(input?.ingredients) ? input.ingredients : [];
  const ingredients: RecipeIngredientRecord[] = [];

  ingredientsInput.forEach((usage: any) => {
    const ingName = cleanName(usage?.name ?? "");
    if (!ingName) return;
    const ing = ensureIngredient(ingName, usage?.unit ?? undefined);
    const quantity = parseQuantity(usage?.quantity);
    const unit = usage?.unit?.trim() ?? ing.unit ?? null;
    ing.recipeIds.add(id);
    ingredients.push({
      ingredientId: ing.id,
      name: ing.name,
      unit,
      quantity,
      notes: typeof usage?.notes === "string" && usage.notes.trim() ? usage.notes.trim() : null,
      isPantryItem: ing.isPantryItem,
      category: ing.category,
    });
  });

  const record: RecipeRecord = {
    id,
    name,
    description,
    category: input?.category ?? "VEGETAR",
    everydayScore: Number(input?.everydayScore ?? 3),
    healthScore: Number(input?.healthScore ?? 4),
    usageCount: 0,
    lastUsed: null,
    ingredients,
  };

  state.recipesById.set(id, record);
  return serializeRecipe(record);
}

async function handleRecipeUpdate(input: any) {
  const id = input?.id;
  if (typeof id !== "string" || !state.recipesById.has(id)) {
    throw new Error("Ukjent oppskrift");
  }
  const record = state.recipesById.get(id)!;

  record.ingredients.forEach((ing) => {
    const ingredient = state.ingredientsById.get(ing.ingredientId);
    ingredient?.recipeIds.delete(id);
  });

  record.name = cleanName(input?.name ?? record.name);
  record.description = typeof input?.description === "string" && input.description.trim() ? input.description.trim() : undefined;
  record.category = input?.category ?? record.category;
  record.everydayScore = Number(input?.everydayScore ?? record.everydayScore);
  record.healthScore = Number(input?.healthScore ?? record.healthScore);

  const ingredientsInput: SeedIngredientUsage[] = Array.isArray(input?.ingredients) ? input.ingredients : [];
  record.ingredients = ingredientsInput
    .map((usage: any) => {
      const ingName = cleanName(usage?.name ?? "");
      if (!ingName) return null;
      const ing = ensureIngredient(ingName, usage?.unit ?? undefined);
      const quantity = parseQuantity(usage?.quantity);
      const unit = usage?.unit?.trim() ?? ing.unit ?? null;
      ing.recipeIds.add(id);
      return {
        ingredientId: ing.id,
        name: ing.name,
        unit,
        quantity,
        notes: typeof usage?.notes === "string" && usage.notes.trim() ? usage.notes.trim() : null,
        isPantryItem: ing.isPantryItem,
        category: ing.category,
      };
    })
    .filter((item): item is RecipeIngredientRecord => Boolean(item));

  return serializeRecipe(record);
}

async function handleIngredientList(input?: any) {
  const term = typeof input?.search === "string" ? input.search.trim().toLowerCase() : "";
  const list = Array.from(state.ingredientsById.values())
    .map((ing) => ({
      id: ing.id,
      name: ing.name,
      unit: ing.unit ?? undefined,
      usageCount: ing.recipeIds.size,
      isPantryItem: ing.isPantryItem,
      category: ing.category,
    }))
    .filter((item) => (term ? item.name.toLowerCase().includes(term) : true))
    .sort((a, b) => a.name.localeCompare(b.name, "nb", { sensitivity: "base" }));
  return list;
}

async function handleIngredientCreate(input: any) {
  const name = cleanName(input?.name ?? "");
  if (!name) throw new Error("Navn er påkrevd");
  const unit = typeof input?.unit === "string" && input.unit.trim() ? input.unit.trim() : undefined;
  const isPantryItem = typeof input?.isPantryItem === "boolean" ? input.isPantryItem : undefined;
  const category = typeof input?.category === "string" ? input.category : undefined;
  const ing = ensureIngredient(name, unit, isPantryItem, category);
  if (unit) {
    ing.unit = unit;
  }
  if (typeof isPantryItem === "boolean") {
    ing.isPantryItem = isPantryItem;
  }
  if (category) {
    ing.category = normalizeIngredientCategory(category);
  }
  return {
    id: ing.id,
    name: ing.name,
    unit: ing.unit ?? undefined,
    isPantryItem: ing.isPantryItem,
    category: ing.category,
  };
}

async function handleIngredientDetail(input: any) {
  const id = typeof input?.id === "string" ? input.id : null;
  if (!id || !state.ingredientsById.has(id)) throw new Error("Ingrediens ikke funnet");
  const ing = state.ingredientsById.get(id)!;
  const recipes = Array.from(ing.recipeIds)
    .map((recipeId) => state.recipesById.get(recipeId))
    .filter((recipe): recipe is RecipeRecord => Boolean(recipe))
    .map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      category: recipe.category,
      everydayScore: recipe.everydayScore,
      healthScore: recipe.healthScore,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "nb", { sensitivity: "base" }));
  return {
    id: ing.id,
    name: ing.name,
    unit: ing.unit ?? undefined,
    isPantryItem: ing.isPantryItem,
    category: ing.category,
    recipes,
  };
}

async function handleWeekPlan(input: any) {
  const weekStart = startOfWeekISO(input?.weekStart);
  const plan = ensureWeekPlan(weekStart);
  return serializeWeekPlan(plan);
}

async function handleGenerateWeekPlan(input: any) {
  const weekStart = startOfWeekISO(input?.weekStart);
  const plan: WeekPlanRecord = {
    weekStart,
    entries: generateWeekEntries(),
    updatedAt: new Date().toISOString(),
  };
  state.weekPlans.set(weekStart, plan);
  return serializeWeekPlan(plan);
}

async function handleSaveWeekPlan(input: any) {
  const weekStart = startOfWeekISO(input?.weekStart);
  const entries: WeekPlanEntryRecord[] = Array.isArray(input?.days)
    ? input.days.slice(0, 7).map((entry: any) => {
        if (entry?.type === "RECIPE" && typeof entry?.recipeId === "string") {
          return { type: "RECIPE", recipeId: entry.recipeId };
        }
        if (entry?.type === "TAKEAWAY") {
          return { type: "TAKEAWAY" };
        }
        return { type: "EMPTY" };
      })
    : [];
  while (entries.length < 7) {
    entries.push({ type: "EMPTY" });
  }
  const plan: WeekPlanRecord = {
    weekStart,
    entries,
    updatedAt: new Date().toISOString(),
  };
  state.weekPlans.set(weekStart, plan);
  return serializeWeekPlan(plan);
}

async function handleWeekTimeline(input: any) {
  const baseWeek = startOfWeekISO(input?.around);
  const weeks: {
    weekStart: string;
    weekEnd: string;
    updatedAt: string | null;
    hasEntries: boolean;
  }[] = [];

  for (let offset = -4; offset <= 4; offset += 1) {
    const weekIso = addWeeksISO(baseWeek, offset);
    const plan = ensureWeekPlan(weekIso);
    weeks.push({
      weekStart: weekIso,
      weekEnd: addDaysISO(weekIso, 6),
      updatedAt: plan.updatedAt,
      hasEntries: plan.entries.some((entry) => entry.type !== "EMPTY"),
    });
  }

  return { currentWeekStart: baseWeek, weeks };
}

async function handleSuggestions(input: any) {
  const args = {
    type: input?.type ?? "longGap",
    search: typeof input?.search === "string" ? input.search : undefined,
    excludeIds: Array.isArray(input?.excludeIds) ? input.excludeIds.filter((id: any) => typeof id === "string") : [],
    limit: Number(input?.limit ?? 6) || 6,
  } as const;

  if (args.type === "search" && !(args.search ?? "").trim()) {
    return [];
  }

  const records = getSuggestionRecords(args.type, {
    limit: args.limit,
    exclude: new Set(args.excludeIds),
    search: args.search,
  });
  return records.map(serializeRecipe);
}

async function handleShoppingList(input: any) {
  const includeNextWeek = Boolean(input?.includeNextWeek);
  const rawLookahead = Number(input?.lookaheadWeeks);
  const lookaheadWeeks =
    Number.isFinite(rawLookahead) && rawLookahead > 0
      ? Math.min(4, Math.max(0, Math.trunc(rawLookahead)))
      : includeNextWeek
        ? 1
        : 0;
  const base = startOfWeekISO(input?.weekStart);
  const weekStarts = [base];
  for (let i = 1; i <= lookaheadWeeks; i += 1) {
    weekStarts.push(addWeeksISO(base, i));
  }

  const { items, extras, plannedDays } = aggregateShopping(weekStarts);
  return {
    weekStart: base,
    includedWeekStarts: weekStarts,
    items,
    extras,
    plannedDays,
  };
}

async function handleUpdateShoppingItem(input: any) {
  const ingredientId = typeof input?.ingredientId === "string" ? input.ingredientId : null;
  if (!ingredientId) throw new Error("ingredientId mangler");
  const unitKey = typeof input?.unit === "string" ? input.unit : "";
  const checked = Boolean(input?.checked);
  const occurrenceList: Array<{ weekStart: string; dayIndex: number }> = Array.isArray(input?.occurrences)
    ? input.occurrences
        .map((occ: any) => {
          const week = startOfWeekISO(occ?.weekStart);
          const dayIndex = typeof occ?.dayIndex === "number" && Number.isFinite(occ.dayIndex)
            ? Math.max(MIN_DAY_INDEX, Math.min(MAX_DAY_INDEX, Math.trunc(occ.dayIndex)))
            : null;
          return dayIndex == null ? null : { weekStart: week, dayIndex };
        })
        .filter((occurrence: { weekStart: string; dayIndex: number } | null): occurrence is {
          weekStart: string;
          dayIndex: number;
        } => Boolean(occurrence))
    : [];

  const weekMeta = new Map<string, { dayIndices: number[] }>();

  occurrenceList.forEach((occurrence) => {
    if (!weekMeta.has(occurrence.weekStart)) {
      weekMeta.set(occurrence.weekStart, { dayIndices: [] });
    }
    weekMeta.get(occurrence.weekStart)!.dayIndices.push(occurrence.dayIndex);
    state.shoppingChecks.set(
      `${occurrence.weekStart}::${occurrence.dayIndex}::${ingredientId}::${unitKey}`,
      checked
    );
  });

  const weeks: string[] = Array.isArray(input?.weeks)
    ? input.weeks.map((week: any) => startOfWeekISO(week))
    : [];
  weeks.forEach((week) => {
    if (!weekMeta.has(week)) {
      weekMeta.set(week, { dayIndices: [] });
    }
  });

  if (weekMeta.size === 0 && input?.weekStart) {
    const week = startOfWeekISO(input.weekStart);
    weekMeta.set(week, { dayIndices: [] });
  }

  if (weekMeta.size === 0) {
    throw new Error("weekStart mangler for handlelisteoppdatering");
  }

  weekMeta.forEach((meta, week) => {
    const weekKey = `${week}::${ingredientId}::${unitKey}`;
    state.shoppingChecks.set(weekKey, checked);
    if (checked) {
      if (meta.dayIndices.length > 0) {
        const firstDayIndex = Math.min(...meta.dayIndices);
        state.shoppingFirstChecked.set(weekKey, firstDayIndex);
      } else {
        state.shoppingFirstChecked.delete(weekKey);
      }
    } else {
      state.shoppingFirstChecked.delete(weekKey);
    }
  });

  return { ok: true };
}

async function handleExtraAdd(input: any) {
  const name = cleanName(input?.name ?? "");
  if (!name) throw new Error("Navn er påkrevd");
  const record = ensureExtraCatalog(name);
  return { id: record.id, name: record.name };
}

async function handleExtraToggle(input: any) {
  const weekStart = startOfWeekISO(input?.weekStart);
  const name = cleanName(input?.name ?? "");
  if (!name) throw new Error("Navn er påkrevd");
  const catalog = ensureExtraCatalog(name);
  let weekEntries = state.extrasByWeek.get(weekStart);
  if (!weekEntries) {
    weekEntries = new Map<string, ExtraEntryRecord>();
    state.extrasByWeek.set(weekStart, weekEntries);
  }
  let entry = weekEntries.get(catalog.id);
  const nextChecked = typeof input?.checked === "boolean" ? Boolean(input.checked) : !entry?.checked;
  if (!entry) {
    entry = { id: randomId("extra-entry"), name: catalog.name, checked: nextChecked, catalogId: catalog.id, updatedAt: new Date().toISOString() };
    weekEntries.set(catalog.id, entry);
  } else {
    entry.checked = nextChecked;
    entry.updatedAt = new Date().toISOString();
  }
  return { id: entry.id, checked: entry.checked };
}

async function handleExtraRemove(input: any) {
  const weekStart = startOfWeekISO(input?.weekStart);
  const name = cleanName(input?.name ?? "");
  if (!name) return { ok: true };
  const catalog = state.extrasCatalogByName.get(normalizeName(name));
  if (!catalog) return { ok: true };
  const entries = state.extrasByWeek.get(weekStart);
  if (!entries) return { ok: true };
  entries.delete(catalog.id);
  return { ok: true };
}

async function handleExtraSuggest(input: any) {
  const term = typeof input?.search === "string" ? input.search.trim().toLowerCase() : "";
  if (!term) return [] as { id: string; name: string }[];
  const all = Array.from(state.extrasCatalogById.values());
  return all
    .filter((item) => item.name.toLowerCase().includes(term))
    .sort((a, b) => a.name.localeCompare(b.name, "nb", { sensitivity: "base" }))
    .slice(0, 20)
    .map((item) => ({ id: item.id, name: item.name }));
}

function resolveRole(value: unknown): ShoppingRole {
  return value === "INGVILD" ? "INGVILD" : "JENS";
}

function serializeShoppingStore(store: ShoppingStoreRecord) {
  return {
    id: store.id,
    name: store.name,
    categoryOrder: normalizeCategoryOrder(store.categoryOrder),
    isDefault: Boolean(store.isDefault),
  };
}

function serializeShoppingRoleSettings(settings: ShoppingRoleSettingsRecord, fallbackStoreId: string | null) {
  return {
    role: settings.role,
    defaultViewMode: settings.defaultViewMode,
    startDay: Math.max(MIN_DAY_INDEX, Math.min(MAX_DAY_INDEX, settings.startDay)),
    includeNextWeek: settings.includeNextWeek,
    showPantryWithIngredients: settings.showPantryWithIngredients,
    visibleDayIndices: sanitizeDayIndices(settings.visibleDayIndices),
    defaultStoreId: settings.defaultStoreId ?? fallbackStoreId,
  };
}

async function handleShoppingSettings(input: any) {
  const deviceId = String(input?.deviceId ?? "").trim();
  if (!deviceId) throw new Error("deviceId mangler");

  let activeRole = state.deviceRoles.get(deviceId);
  if (!activeRole) {
    activeRole = "JENS";
    state.deviceRoles.set(deviceId, activeRole);
  }

  const stores = Array.from(state.shoppingStores.values())
    .sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return a.name.localeCompare(b.name, "nb", { sensitivity: "base" });
    })
    .map(serializeShoppingStore);

  const fallbackStoreId = stores.find((store) => store.isDefault)?.id ?? stores[0]?.id ?? null;

  const roles = (["INGVILD", "JENS"] as const).map((role) => {
    const settings = state.shoppingRoleSettings.get(role);
    if (!settings) {
      return {
        role,
        defaultViewMode: "by-day" as const,
        startDay: 0,
        includeNextWeek: false,
        showPantryWithIngredients: false,
        visibleDayIndices: [...DEFAULT_VISIBLE_DAY_INDICES],
        defaultStoreId: fallbackStoreId,
      };
    }
    return serializeShoppingRoleSettings(settings, fallbackStoreId);
  });

  return {
    deviceId,
    activeRole,
    roles,
    stores,
  };
}

async function handleSetShoppingDeviceRole(input: any) {
  const deviceId = String(input?.deviceId ?? "").trim();
  if (!deviceId) throw new Error("deviceId mangler");
  const role = resolveRole(input?.role);
  state.deviceRoles.set(deviceId, role);
  return { deviceId, role };
}

async function handleUpdateShoppingRoleSettings(input: any) {
  const role = resolveRole(input?.role);
  const defaultStoreIdInput = typeof input?.defaultStoreId === "string" ? input.defaultStoreId : null;
  const defaultStoreId =
    defaultStoreIdInput && state.shoppingStores.has(defaultStoreIdInput)
      ? defaultStoreIdInput
      : Array.from(state.shoppingStores.values()).find((store) => store.isDefault)?.id ?? null;

  const existing = state.shoppingRoleSettings.get(role);
  const next: ShoppingRoleSettingsRecord = {
    role,
    defaultViewMode:
      input?.defaultViewMode === "alphabetical" || input?.defaultViewMode === "by-category"
        ? input.defaultViewMode
        : existing?.defaultViewMode ?? "by-day",
    startDay:
      typeof input?.startDay === "number"
        ? Math.max(MIN_DAY_INDEX, Math.min(MAX_DAY_INDEX, Math.trunc(input.startDay)))
        : existing?.startDay ?? 0,
    includeNextWeek:
      typeof input?.includeNextWeek === "boolean"
        ? input.includeNextWeek
        : existing?.includeNextWeek ?? false,
    showPantryWithIngredients:
      typeof input?.showPantryWithIngredients === "boolean"
        ? input.showPantryWithIngredients
        : existing?.showPantryWithIngredients ?? false,
    visibleDayIndices: sanitizeDayIndices(input?.visibleDayIndices),
    defaultStoreId,
  };
  state.shoppingRoleSettings.set(role, next);
  return serializeShoppingRoleSettings(next, defaultStoreId);
}

async function handleCreateShoppingStore(input: any) {
  const name = String(input?.name ?? "").trim();
  if (!name) throw new Error("Navn er påkrevd");

  const providedOrder = Array.isArray(input?.categoryOrder) ? input.categoryOrder : [];
  const normalizedOrder = providedOrder.map((value: string) => normalizeIngredientCategory(value));
  const unique = new Set(normalizedOrder);
  if (normalizedOrder.length !== INGREDIENT_CATEGORIES.length || unique.size !== INGREDIENT_CATEGORIES.length) {
    throw new Error("Butikkrekkefølgen må inneholde hver kategori nøyaktig én gang");
  }

  const hasExisting = Array.from(state.shoppingStores.values()).some(
    (store) => normalizeName(store.name) === normalizeName(name),
  );
  if (hasExisting) {
    throw new Error("Det finnes allerede en butikk med dette navnet");
  }

  const id = randomId("shopping-store");
  const store: ShoppingStoreRecord = {
    id,
    name,
    categoryOrder: normalizedOrder,
    isDefault: false,
  };
  state.shoppingStores.set(id, store);
  return serializeShoppingStore(store);
}

export async function handleMockQuery(path: string, input: unknown) {
  switch (path) {
    case "recipe.list":
      return handleRecipeList(input);
    case "ingredient.list":
      return handleIngredientList(input);
    case "ingredient.getWithRecipes":
      return handleIngredientDetail(input);
    case "planner.getWeekPlan":
      return handleWeekPlan(input);
    case "planner.weekTimeline":
      return handleWeekTimeline(input);
    case "planner.suggestions":
      return handleSuggestions(input);
    case "planner.shoppingList":
      return handleShoppingList(input);
    case "planner.shoppingSettings":
      return handleShoppingSettings(input);
    case "planner.extraSuggest":
      return handleExtraSuggest(input);
    default:
      throw new Error(`Mock query mangler implementasjon: ${path}`);
  }
}

export async function handleMockMutation(path: string, input: unknown) {
  switch (path) {
    case "recipe.create":
      return handleRecipeCreate(input);
    case "recipe.update":
      return handleRecipeUpdate(input);
    case "ingredient.create":
      return handleIngredientCreate(input);
    case "planner.generateWeekPlan":
      return handleGenerateWeekPlan(input);
    case "planner.saveWeekPlan":
      return handleSaveWeekPlan(input);
    case "planner.updateShoppingItem":
      return handleUpdateShoppingItem(input);
    case "planner.setShoppingDeviceRole":
      return handleSetShoppingDeviceRole(input);
    case "planner.updateShoppingRoleSettings":
      return handleUpdateShoppingRoleSettings(input);
    case "planner.createShoppingStore":
      return handleCreateShoppingStore(input);
    case "planner.extraAdd":
      return handleExtraAdd(input);
    case "planner.extraToggle":
      return handleExtraToggle(input);
    case "planner.extraRemove":
      return handleExtraRemove(input);
    default:
      throw new Error(`Mock mutation mangler implementasjon: ${path}`);
  }
}

export type MockRecipeSummary = ReturnType<typeof serializeRecipe>;
export type MockRecipeListResult = Awaited<ReturnType<typeof handleRecipeList>>;
export type MockIngredientListResult = Awaited<ReturnType<typeof handleIngredientList>>;
export type MockIngredientDetailResult = Awaited<ReturnType<typeof handleIngredientDetail>>;
export type MockWeekPlanResult = Awaited<ReturnType<typeof handleWeekPlan>>;
export type MockWeekTimelineResult = Awaited<ReturnType<typeof handleWeekTimeline>>;
export type MockSuggestionsResult = Awaited<ReturnType<typeof handleSuggestions>>;
export type MockShoppingListResult = Awaited<ReturnType<typeof handleShoppingList>>;
export type MockShoppingSettingsResult = Awaited<ReturnType<typeof handleShoppingSettings>>;
export type MockExtraSuggestResult = Awaited<ReturnType<typeof handleExtraSuggest>>;
