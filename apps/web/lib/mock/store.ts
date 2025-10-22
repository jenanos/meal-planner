/* global globalThis */
import { EXTRA_CATALOG, INGREDIENTS as SEED_INGREDIENTS, RECIPES as SEED_RECIPES } from "./seed-data";
import type { SeedIngredientUsage, SeedRecipe } from "./seed-data";

const MS_PER_DAY = 86_400_000;

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

type IngredientRecord = {
  id: string;
  name: string;
  unit: string | null;
  recipeIds: Set<string>;
};

type RecipeIngredientRecord = {
  ingredientId: string;
  name: string;
  unit: string | null;
  quantity: number | null;
  notes: string | null;
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
  recipeIds: (string | null)[];
  updatedAt: string | null;
};

type ExtraCatalogRecord = { id: string; name: string };

type ExtraEntryRecord = { id: string; name: string; checked: boolean; catalogId: string };

type MockState = {
  ingredientsById: Map<string, IngredientRecord>;
  ingredientsByName: Map<string, IngredientRecord>;
  recipesById: Map<string, RecipeRecord>;
  extrasCatalogById: Map<string, ExtraCatalogRecord>;
  extrasCatalogByName: Map<string, ExtraCatalogRecord>;
  weekPlans: Map<string, WeekPlanRecord>;
  shoppingChecks: Map<string, boolean>;
  extrasByWeek: Map<string, Map<string, ExtraEntryRecord>>;
};

function createInitialState(): MockState {
  const ingredientsById = new Map<string, IngredientRecord>();
  const ingredientsByName = new Map<string, IngredientRecord>();

  function ensureIngredient(name: string, unit?: string | null) {
    const normalized = normalizeName(name);
    let record = ingredientsByName.get(normalized);
    if (!record) {
      record = {
        id: uuidFromString(`ingredient:${normalized}`),
        name: cleanName(name),
        unit: unit?.trim() ?? null,
        recipeIds: new Set<string>(),
      };
      ingredientsByName.set(normalized, record);
      ingredientsById.set(record.id, record);
    } else if (unit && !record.unit) {
      record.unit = unit.trim();
    }
    return record;
  }

  SEED_INGREDIENTS.forEach((ing) => {
    ensureIngredient(ing.name, ing.unit ?? null);
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

  return {
    ingredientsById,
    ingredientsByName,
    recipesById,
    extrasCatalogById,
    extrasCatalogByName,
    weekPlans: new Map<string, WeekPlanRecord>(),
    shoppingChecks: new Map<string, boolean>(),
    extrasByWeek: new Map<string, Map<string, ExtraEntryRecord>>(),
  };
}

const state = createInitialState();

function ensureIngredient(name: string, unit?: string | null) {
  const normalized = normalizeName(name);
  let record = state.ingredientsByName.get(normalized);
  if (!record) {
    record = {
      id: randomId("ingredient"),
      name: cleanName(name),
      unit: unit?.trim() ?? null,
      recipeIds: new Set<string>(),
    };
    state.ingredientsByName.set(normalized, record);
    state.ingredientsById.set(record.id, record);
  } else if (unit && !record.unit) {
    record.unit = unit.trim();
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

function generateWeekRecipeIds(): (string | null)[] {
  const chosen: (string | null)[] = Array(7).fill(null);
  const exclude = new Set<string>();
  const pushRecipes = (records: RecipeRecord[]) => {
    for (const recipe of records) {
      if (exclude.has(recipe.id)) continue;
      const idx = chosen.findIndex((slot) => slot == null);
      if (idx === -1) break;
      chosen[idx] = recipe.id;
      exclude.add(recipe.id);
    }
  };

  pushRecipes(getSuggestionRecords("longGap", { limit: 14, exclude }));
  if (chosen.some((slot) => slot == null)) {
    pushRecipes(getSuggestionRecords("frequent", { limit: 14, exclude }));
  }
  if (chosen.some((slot) => slot == null)) {
    pushRecipes(getAllRecipes());
  }
  return chosen;
}

function ensureWeekPlan(weekStart: string) {
  const key = startOfWeekISO(weekStart);
  let plan = state.weekPlans.get(key);
  if (!plan) {
    plan = {
      weekStart: key,
      recipeIds: generateWeekRecipeIds(),
      updatedAt: new Date().toISOString(),
    };
    state.weekPlans.set(key, plan);
  }
  return plan;
}

function serializeWeekPlan(plan: WeekPlanRecord) {
  const days = plan.recipeIds.map((id, index) => ({
    dayIndex: index,
    recipe: id ? serializeRecipe(state.recipesById.get(id)!) : null,
  }));
  const exclude = plan.recipeIds.filter((id): id is string => Boolean(id));
  return {
    weekStart: plan.weekStart,
    updatedAt: plan.updatedAt,
    days,
    suggestions: buildSuggestionBuckets(exclude),
  };
}

function aggregateShopping(weekStarts: string[]) {
  type Accumulator = {
    ingredientId: string;
    name: string;
    unit: string | null;
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
    }[];
    weeks: Set<string>;
  };

  const accMap = new Map<string, Accumulator>();

  for (const week of weekStarts) {
    const plan = ensureWeekPlan(week);
    plan.recipeIds.forEach((recipeId) => {
      if (!recipeId) return;
      const recipe = state.recipesById.get(recipeId);
      if (!recipe) return;
      recipe.ingredients.forEach((ing) => {
        const unitKey = ing.unit ?? "";
        const key = `${ing.ingredientId}::${unitKey}`;
        if (!accMap.has(key)) {
          accMap.set(key, {
            ingredientId: ing.ingredientId,
            name: ing.name,
            unit: ing.unit ?? null,
            totalQuantity: 0,
            hasQuantity: false,
            hasMissing: false,
            details: [],
            weeks: new Set<string>(),
          });
        }
        const bucket = accMap.get(key)!;
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
        });
        bucket.weeks.add(week);
      });
    });
  }

  const items = Array.from(accMap.values())
    .map((bucket) => {
      const weeks = Array.from(bucket.weeks.values());
      const unitKey = bucket.unit ?? "";
      const checked = weeks.every((week) => state.shoppingChecks.get(`${week}::${bucket.ingredientId}::${unitKey}`));
      return {
        ingredientId: bucket.ingredientId,
        name: bucket.name,
        unit: bucket.unit,
        totalQuantity: bucket.hasQuantity ? bucket.totalQuantity : null,
        hasMissingQuantities: bucket.hasMissing,
        details: bucket.details,
        weekStarts: weeks,
        checked,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "nb", { sensitivity: "base" }));

  const extras: { id: string; name: string; weekStart: string; checked: boolean }[] = [];
  weekStarts.forEach((week) => {
    const entries = state.extrasByWeek.get(week);
    if (!entries) return;
    entries.forEach((entry) => {
      extras.push({ id: entry.id, name: entry.name, weekStart: week, checked: entry.checked });
    });
  });

  return { items, extras };
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
    }))
    .filter((item) => (term ? item.name.toLowerCase().includes(term) : true))
    .sort((a, b) => a.name.localeCompare(b.name, "nb", { sensitivity: "base" }));
  return list;
}

async function handleIngredientCreate(input: any) {
  const name = cleanName(input?.name ?? "");
  if (!name) throw new Error("Navn er påkrevd");
  const unit = typeof input?.unit === "string" && input.unit.trim() ? input.unit.trim() : undefined;
  const ing = ensureIngredient(name, unit);
  if (unit) {
    ing.unit = unit;
  }
  return { id: ing.id, name: ing.name, unit: ing.unit ?? undefined };
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
  return { id: ing.id, name: ing.name, unit: ing.unit ?? undefined, recipes };
}

async function handleWeekPlan(input: any) {
  const weekStart = startOfWeekISO(input?.weekStart);
  const plan = ensureWeekPlan(weekStart);
  return serializeWeekPlan(plan);
}

async function handleGenerateWeekPlan(input: any) {
  const weekStart = startOfWeekISO(input?.weekStart);
  const recipeIds = generateWeekRecipeIds();
  const plan: WeekPlanRecord = {
    weekStart,
    recipeIds,
    updatedAt: new Date().toISOString(),
  };
  state.weekPlans.set(weekStart, plan);
  return serializeWeekPlan(plan);
}

async function handleSaveWeekPlan(input: any) {
  const weekStart = startOfWeekISO(input?.weekStart);
  const recipeIds: (string | null)[] = Array.isArray(input?.recipeIdsByDay)
    ? input.recipeIdsByDay.map((id: any) => (typeof id === "string" ? id : null)).slice(0, 7)
    : [];
  while (recipeIds.length < 7) {
    recipeIds.push(null);
  }
  const plan: WeekPlanRecord = {
    weekStart,
    recipeIds,
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
      hasEntries: plan.recipeIds.some((id) => Boolean(id)),
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
  const base = startOfWeekISO(input?.weekStart);
  const weekStarts = [base];
  if (includeNextWeek) {
    weekStarts.push(addWeeksISO(base, 1));
  }

  const { items, extras } = aggregateShopping(weekStarts);
  return {
    weekStart: base,
    includedWeekStarts: weekStarts,
    items,
    extras,
  };
}

async function handleUpdateShoppingItem(input: any) {
  const weeks: string[] = Array.isArray(input?.weeks)
    ? input.weeks.map((week: any) => startOfWeekISO(week))
    : [];
  const ingredientId = typeof input?.ingredientId === "string" ? input.ingredientId : null;
  if (!ingredientId) throw new Error("ingredientId mangler");
  const unitKey = typeof input?.unit === "string" ? input.unit : "";
  const checked = Boolean(input?.checked);
  weeks.forEach((week) => {
    state.shoppingChecks.set(`${week}::${ingredientId}::${unitKey}`, checked);
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
    entry = { id: randomId("extra-entry"), name: catalog.name, checked: nextChecked, catalogId: catalog.id };
    weekEntries.set(catalog.id, entry);
  } else {
    entry.checked = nextChecked;
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
