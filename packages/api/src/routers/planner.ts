import { prisma, Prisma } from "@repo/database";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc.js";
import {
  PlannerConstraints,
  WeekPlanInput,
  ExtraItemSuggest,
  ExtraItemUpsert,
  ExtraCatalogBulkCategoryUpdate,
  ExtraShoppingToggle,
  ExtraShoppingRemove,
  ShoppingSettingsGetInput,
  ShoppingDeviceRoleUpsert,
  ShoppingRoleSettingsUpdate,
  ShoppingStoreCreate,
} from "../schemas.js";
import { z } from "zod";

/** Day + meta (kan utvides senere) */
interface DayMeta {
  label: string;
}

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type DayIndex = (typeof DAYS)[number];

const CATEGORY_KEYS = [
  "FISK",
  "VEGETAR",
  "KYLLING",
  "STORFE",
  "ANNET",
] as const;
type MealCategoryKey = (typeof CATEGORY_KEYS)[number];

const INGREDIENT_CATEGORY_KEYS = [
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
type IngredientCategoryKey = (typeof INGREDIENT_CATEGORY_KEYS)[number];

const SHOPPING_USER_ROLES = ["INGVILD", "JENS"] as const;
type ShoppingUserRoleKey = (typeof SHOPPING_USER_ROLES)[number];

const DEFAULT_VISIBLE_DAY_INDICES = [0, 1, 2, 3, 4, 5, 6] as const;

const STANDARD_STORE_NAME = "Standard butikk";
const STANDARD_STORE_CATEGORY_ORDER: IngredientCategoryKey[] = [
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
];

const DAY_META: Record<DayIndex, DayMeta> = {
  0: { label: "Mon" },
  1: { label: "Tue" },
  2: { label: "Wed" },
  3: { label: "Thu" },
  4: { label: "Fri" },
  5: { label: "Sat" },
  6: { label: "Sun" },
};

function getDayMeta(d: DayIndex) {
  return DAY_META[d];
}

type RecipeDTO = {
  id: string;
  name: string;
  category: MealCategoryKey;
  everydayScore: number;
  healthScore: number;
  lastUsed: Date | null;
  usageCount: number;
  ingredients: {
    ingredientId: string;
    name: string;
    unit: string | null;
    quantity: number | null;
    notes: string | null;
    isPantryItem: boolean;
    category: IngredientCategoryKey;
  }[];
};

type WeekEntryType = "RECIPE" | "TAKEAWAY" | "EMPTY";

type WeekPlanSuggestionBuckets = {
  longGap: RecipeDTO[];
  frequent: RecipeDTO[];
};

type WeekPlanResponse = {
  weekStart: string;
  updatedAt: string | null;
  days: {
    dayIndex: DayIndex;
    entryType: WeekEntryType;
    recipe: RecipeDTO | null;
  }[];
  suggestions: WeekPlanSuggestionBuckets;
};

type WeekPlanDayEntryInput =
  | { type: "RECIPE"; recipeId: string }
  | { type: "TAKEAWAY" }
  | { type: "EMPTY" };

type PlannerConfig = ReturnType<typeof resolveConstraints>;

function normalizeIngredientCategory(
  value: string | null | undefined,
): IngredientCategoryKey {
  if (!value) return "ANNET";
  const upper = String(value).toUpperCase();
  if (upper === "UKATEGORISERT") return "ANNET";
  if (upper === "FRUKT" || upper === "GRONNSAKER") {
    return "FRUKT_OG_GRONT";
  }
  if (
    INGREDIENT_CATEGORY_KEYS.includes(upper as IngredientCategoryKey)
  ) {
    return upper as IngredientCategoryKey;
  }
  return "ANNET";
}

function normalizeOptionalIngredientCategory(
  value: string | null | undefined,
): IngredientCategoryKey | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return normalizeIngredientCategory(trimmed);
}

async function fetchExtraCatalogCategoryMap(catalogIds: string[]) {
  const uniqueIds = Array.from(new Set(catalogIds.filter(Boolean)));
  const result = new Map<string, IngredientCategoryKey | null>();
  if (!uniqueIds.length) return result;

  const rows = await prisma.$queryRaw<
    Array<{ id: string; category: string | null }>
  >(
    Prisma.sql`
      SELECT
        id::text AS id,
        category::text AS category
      FROM "ExtraItemCatalog"
      WHERE id IN (${Prisma.join(
        uniqueIds.map((id) => Prisma.sql`${id}::uuid`),
      )})
    `,
  );

  for (const row of rows) {
    result.set(row.id, normalizeOptionalIngredientCategory(row.category));
  }

  return result;
}

function toClientViewMode(mode: string | null | undefined) {
  if (mode === "ALPHABETICAL") return "alphabetical";
  if (mode === "BY_CATEGORY") return "by-category";
  return "by-day";
}

function toDbViewMode(mode: string | null | undefined) {
  if (mode === "alphabetical") return "ALPHABETICAL";
  if (mode === "by-category") return "BY_CATEGORY";
  return "BY_DAY";
}

function sanitizeVisibleDayIndices(indices: number[] | null | undefined) {
  const source = Array.isArray(indices) ? indices : [];
  const uniqueSorted = Array.from(
    new Set(
      source
        .filter((value) => Number.isInteger(value))
        .map((value) => Math.min(6, Math.max(0, Number(value)))),
    ),
  ).sort((a, b) => a - b);
  if (!uniqueSorted.length) {
    return [...DEFAULT_VISIBLE_DAY_INDICES];
  }
  return uniqueSorted;
}

function toNumber(value: any): number | null {
  if (value == null) return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function toDTO(r: any): RecipeDTO {
  return {
    id: r.id,
    name: r.name,
    category: normalizeDiet(String(r.category)),
    everydayScore: r.everydayScore,
    healthScore: r.healthScore,
    lastUsed: r.lastUsed ?? null,
    usageCount: r.usageCount,
    ingredients: (r.ingredients ?? []).map((ri: any) => ({
      ingredientId: ri.ingredientId,
      name: ri.ingredient.name,
      unit: ri.ingredient.unit ?? null,
      quantity: toNumber(ri.quantity),
      notes: ri.notes ?? null,
      isPantryItem: Boolean(ri.ingredient.isPantryItem),
      category: normalizeIngredientCategory(ri.ingredient.category),
    })),
  };
}

function daysSince(d?: Date | null) {
  if (!d) return Infinity;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

const suggestionKindSchema = z.enum(["longGap", "frequent", "search"]);
type SuggestionKind = z.infer<typeof suggestionKindSchema>;

const suggestionInputSchema = z.object({
  excludeIds: z.array(z.string().uuid()).default([]),
  limit: z.number().int().min(1).max(20).default(6),
  type: suggestionKindSchema.default("longGap"),
  search: z.string().optional(),
});
type SuggestionInput = z.infer<typeof suggestionInputSchema>;

const weekStartInputSchema = z.object({
  weekStart: z.string().min(1),
});
type WeekStartInput = z.infer<typeof weekStartInputSchema>;

const weekTimelineInputSchema = z.object({
  around: z.string().optional(),
});

const shoppingListInputSchema = z.object({
  weekStart: z.string().optional(),
  includeNextWeek: z.boolean().optional(),
  lookaheadWeeks: z.number().int().min(0).max(4).optional(),
});

const GLOBAL_EXTRA_WEEK_START = new Date("1970-01-05T00:00:00.000Z");

function buildSuggestions(
  pool: RecipeDTO[],
  opts: {
    kind: SuggestionKind;
    limit: number;
    exclude: string[];
    search?: string;
  },
) {
  const excl = new Set(opts.exclude);
  let cand = pool.filter((r) => !excl.has(r.id));

  if (opts.kind === "search" && opts.search) {
    const q = opts.search.toLowerCase();
    cand = cand.filter((r) => r.name.toLowerCase().includes(q));
  } else if (opts.kind === "longGap") {
    cand = cand
      .slice()
      .sort((a, b) => daysSince(b.lastUsed) - daysSince(a.lastUsed));
  } else if (opts.kind === "frequent") {
    cand = cand.slice().sort((a, b) => b.usageCount - a.usageCount);
  }

  return cand.slice(0, opts.limit);
}

function buildSuggestionBuckets(
  pool: RecipeDTO[],
  exclude: string[],
): WeekPlanSuggestionBuckets {
  return {
    longGap: buildSuggestions(pool, {
      kind: "longGap",
      limit: 7,
      exclude,
    }),
    frequent: buildSuggestions(pool, {
      kind: "frequent",
      limit: 7,
      exclude,
    }),
  };
}

function ensureDate(value?: string | Date) {
  const base =
    typeof value === "string" ? new Date(value) : (value ?? new Date());
  if (Number.isNaN(base.getTime())) {
    throw new Error("Invalid date");
  }
  return base;
}

function startOfWeek(dateInput?: string | Date) {
  const date = ensureDate(dateInput);
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = utc.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  utc.setUTCDate(utc.getUTCDate() + diff);
  utc.setUTCHours(0, 0, 0, 0);
  return utc;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addWeeks(date: Date, weeks: number) {
  return addDays(date, weeks * 7);
}

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

function describeOccurrence(weekStartISO: string, dayIndex: number) {
  const weekStart = new Date(weekStartISO);
  const date = addDays(weekStart, dayIndex);
  const weekdayLabel = capitalize(WEEKDAY_FORMATTER.format(date));
  const longLabel = capitalize(WEEKDAY_WITH_DATE_FORMATTER.format(date));
  const shortLabel = SHORT_DATE_FORMATTER.format(date);
  return {
    dateISO: date.toISOString(),
    weekdayLabel,
    longLabel,
    shortLabel,
  };
}

function countOccurrences(ids: string[]) {
  const map = new Map<string, number>();
  ids.forEach((id) => {
    map.set(id, (map.get(id) ?? 0) + 1);
  });
  return map;
}

const PAST_WEEKS_WINDOW = 4;
const FUTURE_WEEKS_LIMIT = 4;

// Avoid leaking Prisma types into exported router types
type TxClient = any;

function maxAllowedFutureWeek() {
  return addWeeks(startOfWeek(), FUTURE_WEEKS_LIMIT);
}

function clampToFutureLimit(weekStart: Date) {
  const max = maxAllowedFutureWeek();
  return weekStart.getTime() > max.getTime() ? max : weekStart;
}

function enforceFutureLimit(weekStart: Date) {
  const max = maxAllowedFutureWeek();
  if (weekStart.getTime() > max.getTime()) {
    throw new Error(
      "Uken ligger lenger frem i tid enn tillatt planleggingshorisont",
    );
  }
}

async function ensureWeekIndex(
  client: TxClient | typeof prisma,
  weekStart: Date,
) {
  const index = await client.weekIndex.upsert({
    where: { weekStart },
    update: {},
    create: { weekStart },
  });

  await client.weekPlan.updateMany({
    where: { weekStart, weekIndexId: null },
    data: { weekIndexId: index.id },
  });

  return index;
}

async function ensureWeekIndexWindow(baseWeek: Date) {
  const maxFuture = maxAllowedFutureWeek();
  const seen = new Map<number, Date>();
  const currentWeek = startOfWeek();

  for (
    let offset = -PAST_WEEKS_WINDOW;
    offset <= FUTURE_WEEKS_LIMIT;
    offset += 1
  ) {
    const candidate = addWeeks(baseWeek, offset);
    if (candidate.getTime() > maxFuture.getTime()) continue;
    seen.set(candidate.getTime(), candidate);
  }

  seen.set(currentWeek.getTime(), currentWeek);

  // for (const week of seen.values()) {
  for (const week of Array.from(seen.values())) {
    await ensureWeekIndex(prisma, week);
  }
}

function normalizeCategoryOrder(
  categoryOrder: string[] | null | undefined,
): IngredientCategoryKey[] {
  const normalized: IngredientCategoryKey[] = [];
  for (const value of categoryOrder ?? []) {
    const category = normalizeIngredientCategory(value);
    if (!normalized.includes(category)) {
      normalized.push(category);
    }
  }
  for (const category of STANDARD_STORE_CATEGORY_ORDER) {
    if (!normalized.includes(category)) {
      normalized.push(category);
    }
  }
  return [...normalized.filter((category) => category !== "ANNET"), "ANNET"];
}

function serializeShoppingStore(store: {
  id: string;
  name: string;
  isDefault: boolean;
  categoryOrder: string[];
}) {
  return {
    id: store.id,
    name: store.name,
    isDefault: Boolean(store.isDefault),
    categoryOrder: normalizeCategoryOrder(store.categoryOrder),
  };
}

function serializeShoppingPreference(
  preference: any,
  fallbackStoreId: string | null,
) {
  return {
    role: preference.role as ShoppingUserRoleKey,
    defaultViewMode: toClientViewMode(preference.defaultViewMode),
    startDay: Math.min(6, Math.max(0, Number(preference.startDay ?? 0))),
    includeNextWeek: Boolean(preference.includeNextWeek),
    showPantryWithIngredients: Boolean(
      preference.showPantryWithIngredients,
    ),
    visibleDayIndices: sanitizeVisibleDayIndices(preference.visibleDayIndices),
    defaultStoreId: preference.defaultStoreId ?? fallbackStoreId,
  };
}

async function ensureShoppingPreferencesSeed(
  client: any = prisma as any,
) {
  const defaultStore = await client.shoppingStore.upsert({
    where: { name: STANDARD_STORE_NAME },
    update: {
      isDefault: true,
      categoryOrder: STANDARD_STORE_CATEGORY_ORDER as any,
    },
    create: {
      name: STANDARD_STORE_NAME,
      isDefault: true,
      categoryOrder: STANDARD_STORE_CATEGORY_ORDER as any,
    },
  });

  await client.shoppingStore.updateMany({
    where: {
      isDefault: true,
      NOT: { id: defaultStore.id },
    },
    data: { isDefault: false },
  });

  for (const role of SHOPPING_USER_ROLES) {
    const existing = await client.shoppingPreference.findUnique({
      where: { role },
    });
    if (!existing) {
      await client.shoppingPreference.create({
        data: {
          role,
          defaultViewMode: "BY_DAY" as any,
          startDay: 0,
          includeNextWeek: false,
          showPantryWithIngredients: false,
          visibleDayIndices: [...DEFAULT_VISIBLE_DAY_INDICES],
          defaultStoreId: defaultStore.id,
        },
      });
      continue;
    }
    if (!existing.defaultStoreId) {
      await client.shoppingPreference.update({
        where: { role },
        data: { defaultStoreId: defaultStore.id },
      });
    }
  }

  return defaultStore;
}

async function writeWeekPlan(weekStart: Date, days: WeekPlanDayEntryInput[]) {
  if (days.length !== 7) {
    throw new Error("days must have length 7");
  }

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const index = await ensureWeekIndex(tx, weekStart);
    const plan = await tx.weekPlan.upsert({
      where: { weekStart },
      update: { weekIndexId: index.id },
      create: { weekStart, weekIndexId: index.id, createdAt: now },
    });

    const prevEntries = await tx.weekPlanEntry.findMany({
      where: { weekPlanId: plan.id },
    });
    const prevCounts = countOccurrences(
      prevEntries
        .filter((entry) => entry.entryType === "RECIPE" && entry.recipeId)
        .map((entry) => entry.recipeId!),
    );

    for (let i = 0 as DayIndex; i < days.length; i = (i + 1) as DayIndex) {
      const dayEntry = days[i];
      const where = {
        weekPlanId_dayIndex: { weekPlanId: plan.id, dayIndex: i },
      };

      if (dayEntry.type === "RECIPE") {
        await tx.weekPlanEntry.upsert({
          where,
          update: { recipeId: dayEntry.recipeId, entryType: "RECIPE" },
          create: {
            weekPlanId: plan.id,
            dayIndex: i,
            recipeId: dayEntry.recipeId,
            entryType: "RECIPE",
          },
        });
      } else if (dayEntry.type === "TAKEAWAY") {
        await tx.weekPlanEntry.upsert({
          where,
          update: { recipeId: null, entryType: "TAKEAWAY" },
          create: {
            weekPlanId: plan.id,
            dayIndex: i,
            recipeId: null,
            entryType: "TAKEAWAY",
          },
        });
      } else {
        await tx.weekPlanEntry.deleteMany({
          where: {
            weekPlanId: plan.id,
            dayIndex: i,
          },
        });
      }
    }

    const newCounts = countOccurrences(
      days
        .filter(
          (entry): entry is { type: "RECIPE"; recipeId: string } =>
            entry.type === "RECIPE",
        )
        .map((entry) => entry.recipeId),
    );
    for (const [recipeId, newCount] of Array.from(newCounts.entries())) {
      const prevCount = prevCounts.get(recipeId) ?? 0;
      const diff = newCount - prevCount;
      if (diff > 0) {
        await tx.recipe.update({
          where: { id: recipeId },
          data: {
            usageCount: { increment: diff },
            lastUsed: weekStart,
          },
        });
      }
    }

    const entries = await tx.weekPlanEntry.findMany({
      where: { weekPlanId: plan.id },
      include: {
        recipe: {
          include: {
            ingredients: { include: { ingredient: true } },
          },
        },
      },
      orderBy: { dayIndex: "asc" },
    });

    return { plan, entries };
  });
}

function composeWeekResponse(args: {
  weekStart: Date;
  updatedAt: Date | null;
  entries: {
    dayIndex: number;
    recipe: any | null;
    entryType?: WeekEntryType;
  }[];
  suggestions: WeekPlanSuggestionBuckets;
}): WeekPlanResponse {
  const { weekStart, updatedAt, entries, suggestions } = args;
  const entryMap = new Map<
    number,
    { entryType: WeekEntryType; recipe: RecipeDTO | null }
  >();

  entries.forEach((entry) => {
    entryMap.set(entry.dayIndex, {
      entryType: entry.entryType ?? (entry.recipe ? "RECIPE" : "EMPTY"),
      recipe: entry.recipe ? toDTO(entry.recipe) : null,
    });
  });

  return {
    weekStart: weekStart.toISOString(),
    updatedAt: updatedAt ? updatedAt.toISOString() : null,
    days: DAYS.map((dayIndex) => ({
      dayIndex,
      entryType: entryMap.get(dayIndex)?.entryType ?? "EMPTY",
      recipe: entryMap.get(dayIndex)?.recipe ?? null,
    })),
    suggestions,
  };
}

async function fetchAllRecipes() {
  const all = await prisma.recipe.findMany({
    include: { ingredients: { include: { ingredient: true } } },
  });
  return all.map(toDTO);
}

function scoreRecipe(
  r: RecipeDTO,
  dayIndex: DayIndex,
  cfg: ReturnType<typeof resolveConstraints>,
  usedIngredients: Set<string>,
  target: Record<MealCategoryKey, number>,
) {
  const meta = getDayMeta(dayIndex);
  void meta;

  let s = 0;
  const isMonWed = dayIndex <= 2;
  const isThuSat = dayIndex >= 3 && dayIndex <= 5;

  if (isMonWed) {
    s += (4 - Math.min(r.everydayScore, 4)) * 2;
    s += r.healthScore >= 4 ? 2 : 0;
  } else if (isThuSat) {
    s += r.everydayScore >= 4 ? 2 : 0;
    s += r.healthScore >= 3 ? 1 : 0;
  } else {
    s += 1;
  }

  const overlap = r.ingredients.reduce(
    (acc, ingredient) =>
      acc + (usedIngredients.has(ingredient.ingredientId) ? 1 : 0),
    0,
  );
  s += overlap * 1.5;

  const ds = daysSince(r.lastUsed);
  if (ds >= cfg.preferRecentGapDays) s += 2;
  else if (ds < 7) s -= 2;

  if (target[r.category] <= 0 && r.category !== "ANNET") s -= 5;

  return s;
}

function resolveConstraints(input?: z.infer<typeof PlannerConstraints>) {
  return {
    fish: input?.fish ?? 2,
    vegetarian: input?.vegetarian ?? 2,
    chicken: input?.chicken ?? 2,
    beef: input?.beef ?? 1,
    preferRecentGapDays: input?.preferRecentGapDays ?? 21,
  };
}

function makeTargetMap(cfg: PlannerConfig): Record<MealCategoryKey, number> {
  return {
    FISK: cfg.fish,
    VEGETAR: cfg.vegetarian,
    KYLLING: cfg.chicken,
    STORFE: cfg.beef,
    ANNET: 0,
  };
}

function pickWeekRecipes(pool: RecipeDTO[], cfg: PlannerConfig) {
  const usedIngredients = new Set<string>();
  const selected: RecipeDTO[] = [];
  const target = makeTargetMap(cfg);

  for (const dayIndex of DAYS) {
    const available = pool;
    if (!available.length) {
      throw new Error("No recipes available for planner selection");
    }

    const wantsCategory = (recipe: RecipeDTO) =>
      target[recipe.category] > 0 || recipe.category === "ANNET";

    const prioritized = available.filter(wantsCategory);
    const candidates = (prioritized.length ? prioritized : available).map(
      (recipe) => ({
        recipe,
        score: scoreRecipe(recipe, dayIndex, cfg, usedIngredients, target),
      }),
    );

    const pick = candidates.sort((a, b) => b.score - a.score)[0]?.recipe;
    if (!pick) {
      throw new Error("Failed to select recipe for day");
    }

    selected.push(pick);
    target[pick.category] = Math.max(0, target[pick.category] - 1);
    pick.ingredients.forEach((ingredient) =>
      usedIngredients.add(ingredient.ingredientId),
    );
  }

  return selected;
}

type SimpleRecipeInput = { id: string; diet: string } & Record<string, unknown>;

function normalizeDiet(value: string): MealCategoryKey {
  const upper = value.toUpperCase();
  if (upper === "MEAT" || upper === "BEEF" || upper === "STORFE")
    return "STORFE";
  if (upper === "CHICKEN" || upper === "KYLLING") return "KYLLING";
  if (upper === "FISH" || upper === "FISK") return "FISK";
  if (upper === "VEG" || upper === "VEGETAR" || upper === "VEGETARIAN")
    return "VEGETAR";
  return "ANNET";
}

export function selectRecipes(
  recipes: SimpleRecipeInput[],
  targets: Record<string, number>,
) {
  const pool: RecipeDTO[] = recipes.map((recipe) => {
    const category = normalizeDiet(String(recipe.diet));
    return {
      id: recipe.id,
      name: (recipe as { title?: string }).title ?? recipe.id,
      category,
      everydayScore: 3,
      healthScore: 3,
      lastUsed: null,
      usageCount: 0,
      ingredients: [],
    } satisfies RecipeDTO;
  });

  const cfg = resolveConstraints({
    fish: targets.FISH ?? targets.FISK ?? 0,
    vegetarian: targets.VEG ?? targets.VEGETAR ?? 0,
    chicken: targets.CHICKEN ?? targets.KYLLING ?? 0,
    beef: targets.MEAT ?? targets.BEEF ?? targets.STORFE ?? 0,
    preferRecentGapDays: 21,
  });

  const selected = pickWeekRecipes(pool, cfg);
  const lookup = new Map(recipes.map((r) => [r.id, r]));
  return selected.map((recipe) => {
    const base = lookup.get(recipe.id);
    return base ? { ...base } : { id: recipe.id, diet: recipe.category };
  });
}

async function ensureWeekPlanResponse(
  weekStart: Date,
): Promise<WeekPlanResponse> {
  await ensureWeekIndex(prisma, weekStart);
  const [planWithEntries, pool] = await Promise.all([
    prisma.weekPlan.findUnique({
      where: { weekStart },
      include: {
        entries: {
          include: {
            recipe: {
              include: {
                ingredients: { include: { ingredient: true } },
              },
            },
          },
          orderBy: { dayIndex: "asc" },
        },
      },
    }),
    fetchAllRecipes(),
  ]);

  let entries = planWithEntries?.entries ?? [];
  let updatedAt = planWithEntries?.updatedAt ?? null;

  if (!planWithEntries) {
    if (pool.length) {
      const cfg = resolveConstraints();
      const selected = pickWeekRecipes(pool, cfg);
      const days = selected.map((recipe) => ({
        type: "RECIPE" as const,
        recipeId: recipe.id,
      }));
      const persisted = await writeWeekPlan(weekStart, days);
      entries = persisted.entries;
      updatedAt = persisted.plan.updatedAt;
    }
  }

  const suggestions = buildSuggestionBuckets(pool, []);

  return composeWeekResponse({
    weekStart,
    updatedAt,
    entries,
    suggestions,
  });
}

const GenerateWeekInput = z.object({
  weekStart: z.string().optional(),
  constraints: PlannerConstraints.optional(),
});

type GenerateWeekInput = z.infer<typeof GenerateWeekInput>;

export const plannerRouter = router({
  generateWeekPlan: publicProcedure
    .input(GenerateWeekInput.optional())
    .mutation(async ({ input }) => {
      const weekStart = startOfWeek(input?.weekStart);
      enforceFutureLimit(weekStart);
      const cfg = resolveConstraints(input?.constraints);

      const pool = await fetchAllRecipes();
      const selected = pickWeekRecipes(pool, cfg);
      const days = selected.map((recipe) => ({
        type: "RECIPE" as const,
        recipeId: recipe.id,
      }));
      const persisted = await writeWeekPlan(weekStart, days);

      const suggestions = buildSuggestionBuckets(pool, []);

      return composeWeekResponse({
        weekStart,
        updatedAt: persisted.plan.updatedAt,
        entries: persisted.entries,
        suggestions,
      });
    }),

  getWeekPlan: publicProcedure
    .input(weekStartInputSchema)
    .query(async ({ input }) => {
      const targetWeek = startOfWeek(input.weekStart);
      const weekStart = clampToFutureLimit(targetWeek);
      return ensureWeekPlanResponse(weekStart);
    }),

  weekTimeline: publicProcedure
    .input(weekTimelineInputSchema.optional())
    .query(async ({ input }) => {
      let baseWeek = startOfWeek(input?.around);
      const clamped = clampToFutureLimit(baseWeek);
      if (clamped.getTime() !== baseWeek.getTime()) {
        baseWeek = clamped;
      }

      await ensureWeekIndexWindow(baseWeek);

      const windowStart = addWeeks(baseWeek, -PAST_WEEKS_WINDOW);
      const futureEndCandidate = addWeeks(baseWeek, FUTURE_WEEKS_LIMIT);
      const maxFuture = maxAllowedFutureWeek();
      const windowEnd =
        futureEndCandidate.getTime() > maxFuture.getTime()
          ? maxFuture
          : futureEndCandidate;

      const stored = await prisma.weekIndex.findMany({
        where: {
          weekStart: {
            gte: windowStart,
            lte: windowEnd,
          },
        },
        orderBy: { weekStart: "asc" },
        include: {
          plan: {
            select: {
              updatedAt: true,
              _count: { select: { entries: true } },
            },
          },
        },
      });

      const weeks = stored.map((item) => ({
        weekStart: item.weekStart.toISOString(),
        weekEnd: addDays(item.weekStart, 6).toISOString(),
        updatedAt: item.plan?.updatedAt
          ? item.plan.updatedAt.toISOString()
          : null,
        hasEntries: Boolean(item.plan?._count.entries),
      }));

      return {
        currentWeekStart: baseWeek.toISOString(),
        weeks,
      };
    }),

  suggestions: publicProcedure
    .input(suggestionInputSchema.optional())
    .query(async ({ input }) => {
      const args = suggestionInputSchema.parse(input ?? {});
      const pool = await fetchAllRecipes();

      if (args.type === "search" && !(args.search ?? "").trim()) {
        return [];
      }

      return buildSuggestions(pool, {
        kind: args.type,
        limit: args.limit,
        exclude: args.excludeIds,
        search: args.search,
      });
    }),

  shoppingSettings: publicProcedure
    .input(ShoppingSettingsGetInput)
    .query(async ({ input }) => {
      const deviceId = input.deviceId.trim();
      await ensureShoppingPreferencesSeed(prisma);
      const db = prisma as any;

      const [devicePreference, preferences, stores] = await Promise.all([
        db.devicePreference.findUnique({
          where: { deviceId },
        }),
        db.shoppingPreference.findMany({
          orderBy: { role: "asc" },
        }),
        db.shoppingStore.findMany({
          orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        }),
      ]);

      let activeRole = devicePreference?.role as ShoppingUserRoleKey | undefined;
      if (!activeRole || !SHOPPING_USER_ROLES.includes(activeRole)) {
        activeRole = "JENS";
        await db.devicePreference.upsert({
          where: { deviceId },
          create: { deviceId, role: activeRole },
          update: { role: activeRole },
        });
      }

      const serializedStores = stores.map(serializeShoppingStore);
      const fallbackStoreId =
        serializedStores.find((store) => store.isDefault)?.id ?? null;
      const preferenceByRole = new Map(
        preferences.map((preference) => [preference.role, preference]),
      );

      const roles = SHOPPING_USER_ROLES.map((role) => {
        const preference = preferenceByRole.get(role);
        if (!preference) {
          return {
            role,
            defaultViewMode: "by-day",
            startDay: 0,
            includeNextWeek: false,
            showPantryWithIngredients: false,
            visibleDayIndices: [...DEFAULT_VISIBLE_DAY_INDICES],
            defaultStoreId: fallbackStoreId,
          };
        }
        return serializeShoppingPreference(preference, fallbackStoreId);
      });

      return {
        deviceId,
        activeRole,
        roles,
        stores: serializedStores,
      };
    }),

  setShoppingDeviceRole: publicProcedure
    .input(ShoppingDeviceRoleUpsert)
    .mutation(async ({ input }) => {
      const deviceId = input.deviceId.trim();
      await ensureShoppingPreferencesSeed(prisma);
      const db = prisma as any;
      const result = await db.devicePreference.upsert({
        where: { deviceId },
        create: { deviceId, role: input.role as any },
        update: { role: input.role as any },
      });
      return {
        deviceId: result.deviceId,
        role: result.role,
      };
    }),

  updateShoppingRoleSettings: publicProcedure
    .input(ShoppingRoleSettingsUpdate)
    .mutation(async ({ input }) => {
      await ensureShoppingPreferencesSeed(prisma);
      const db = prisma as any;

      const defaultStore = await db.shoppingStore.findFirst({
        where: { isDefault: true },
        orderBy: { createdAt: "asc" },
      });

      let defaultStoreId = input.defaultStoreId ?? defaultStore?.id ?? null;
      if (defaultStoreId) {
        const store = await db.shoppingStore.findUnique({
          where: { id: defaultStoreId },
        });
        if (!store) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Valgt butikk finnes ikke" });
        }
        defaultStoreId = store.id;
      }

      const visibleDayIndices = sanitizeVisibleDayIndices(
        input.visibleDayIndices,
      );

      const updated = await db.shoppingPreference.upsert({
        where: { role: input.role as any },
        create: {
          role: input.role as any,
          defaultViewMode: toDbViewMode(input.defaultViewMode) as any,
          startDay: input.startDay,
          includeNextWeek: input.includeNextWeek,
          showPantryWithIngredients: input.showPantryWithIngredients,
          visibleDayIndices,
          defaultStoreId,
        },
        update: {
          defaultViewMode: toDbViewMode(input.defaultViewMode) as any,
          startDay: input.startDay,
          includeNextWeek: input.includeNextWeek,
          showPantryWithIngredients: input.showPantryWithIngredients,
          visibleDayIndices,
          defaultStoreId,
        },
      });

      return serializeShoppingPreference(updated, defaultStoreId);
    }),

  createShoppingStore: publicProcedure
    .input(ShoppingStoreCreate)
    .mutation(async ({ input }) => {
      await ensureShoppingPreferencesSeed(prisma);
      const db = prisma as any;

      const categoryOrder = input.categoryOrder.map((category) =>
        normalizeIngredientCategory(category),
      );
      const uniqueCategories = new Set(categoryOrder);
      if (uniqueCategories.size !== STANDARD_STORE_CATEGORY_ORDER.length) {
        throw new Error(
          "Butikkrekkefølgen må inneholde hver kategori nøyaktig én gang",
        );
      }

      const normalizedName = input.name.trim();
      try {
        const created = await db.shoppingStore.create({
          data: {
            name: normalizedName,
            categoryOrder: categoryOrder as any,
            isDefault: false,
          },
        });
        return serializeShoppingStore(created);
      } catch (error: any) {
        if (error?.code === "P2002") {
          throw new TRPCError({ code: "CONFLICT", message: "Det finnes allerede en butikk med dette navnet" });
        }
        throw error;
      }
    }),

  shoppingList: publicProcedure
    .input(shoppingListInputSchema.optional())
    .query(async ({ input }) => {
      const args = shoppingListInputSchema.parse(input ?? {});
      const targetWeek = startOfWeek(args.weekStart);
      const weekStart = clampToFutureLimit(targetWeek);
      const includeNextWeek = Boolean(args.includeNextWeek);
      const lookaheadWeeks = args.lookaheadWeeks ?? (includeNextWeek ? 1 : 0);

      const weekStarts: Date[] = [weekStart];
      if (lookaheadWeeks > 0) {
        const maxFuture = maxAllowedFutureWeek();
        for (let i = 1; i <= lookaheadWeeks; i++) {
          const nextWeek = addWeeks(weekStart, i);
          if (nextWeek.getTime() <= maxFuture.getTime()) {
            weekStarts.push(nextWeek);
          }
        }
      }

      for (const week of weekStarts) {
        await ensureWeekIndex(prisma, week);
      }

      const plans = await prisma.weekPlan.findMany({
        where: { weekStart: { in: weekStarts } },
        include: {
          entries: {
            include: {
              recipe: {
                include: {
                  ingredients: { include: { ingredient: true } },
                },
              },
            },
            orderBy: { dayIndex: "asc" },
          },
        },
      });

      const planMap = new Map<number, (typeof plans)[number]>();
      plans.forEach((plan) => {
        planMap.set(plan.weekStart.getTime(), plan);
      });

      const statuses = await prisma.shoppingState.findMany({
        where: {
          weekStart: { in: weekStarts },
        },
      });

      const statusMap = new Map<
        string,
        { checked: boolean; firstCheckedDayIndex: number | null }
      >();
      statuses.forEach((status) => {
        const key = `${status.weekStart.toISOString()}::${status.ingredientId}::${status.unit ?? ""}`;
        statusMap.set(key, {
          checked: status.checked,
          firstCheckedDayIndex: status.firstCheckedDayIndex,
        });
      });

      type OccurrenceAccumulator = {
        weekStartISO: string;
        dayIndex: number;
        quantityTotal: number;
        hasQuantity: boolean;
        hasMissing: boolean;
      };

      type Accumulator = {
        ingredientId: string;
        name: string;
        unit: string | null;
        category: IngredientCategoryKey;
        sumQuantity: number;
        hasQuantities: boolean;
        hasMissingQuantities: boolean;
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

      const map = new Map<string, Accumulator>();

      for (const week of weekStarts) {
        const plan = planMap.get(week.getTime());
        for (const entry of plan?.entries ?? []) {
          if (!entry.recipe) continue;
          const recipe = toDTO(entry.recipe);
          for (const ingredient of recipe.ingredients) {
            const unit = ingredient.unit ?? null;
            const key = `${ingredient.ingredientId}::${unit ?? ""}`;
            if (!map.has(key)) {
              map.set(key, {
                ingredientId: ingredient.ingredientId,
                name: ingredient.name,
                unit,
                category: ingredient.category,
                sumQuantity: 0,
                hasQuantities: false,
                hasMissingQuantities: false,
                details: [],
                weeks: new Set<string>(),
                isPantryItem: ingredient.isPantryItem,
                occurrences: new Map<string, OccurrenceAccumulator>(),
              });
            }
            const acc = map.get(key)!;
            if (ingredient.isPantryItem) {
              acc.isPantryItem = true;
            }
            acc.category = normalizeIngredientCategory(ingredient.category);
            const quantity = ingredient.quantity;
            if (quantity != null) {
              acc.sumQuantity += quantity;
              acc.hasQuantities = true;
            } else {
              acc.hasMissingQuantities = true;
            }
            const weekIso = week.toISOString();
            const dayIndex = entry.dayIndex ?? 0;
            acc.details.push({
              recipeId: recipe.id,
              recipeName: recipe.name,
              quantity,
              unit,
              notes: ingredient.notes,
              weekStart: weekIso,
              dayIndex,
            });
            acc.weeks.add(weekIso);
            const occurrenceKey = `${weekIso}::${dayIndex}`;
            if (!acc.occurrences.has(occurrenceKey)) {
              acc.occurrences.set(occurrenceKey, {
                weekStartISO: weekIso,
                dayIndex,
                quantityTotal: 0,
                hasQuantity: false,
                hasMissing: false,
              });
            }
            const occurrenceBucket = acc.occurrences.get(occurrenceKey)!;
            if (quantity != null) {
              occurrenceBucket.quantityTotal += quantity;
              occurrenceBucket.hasQuantity = true;
            } else {
              occurrenceBucket.hasMissing = true;
            }
          }
        }
      }

      // Build a list of all planned days (recipe or takeaway) so the client
      // can show them even when a recipe has zero ingredients.
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
        const plan = planMap.get(week.getTime());
        for (const entry of plan?.entries ?? []) {
          const weekIso = week.toISOString();
          const dayIndex = entry.dayIndex ?? 0;
          const entryType = entry.entryType ?? (entry.recipe ? "RECIPE" : "EMPTY");
          if (entryType === "RECIPE" || entryType === "TAKEAWAY") {
            const recipeName = entry.recipe ? toDTO(entry.recipe).name : null;
            const labels = describeOccurrence(weekIso, dayIndex);
            plannedDays.push({
              weekStart: weekIso,
              dayIndex,
              recipeName,
              entryType,
              ...labels,
            });
          }
        }
      }

      const items = Array.from(map.values())
        .map((item) => {
          const occurrenceArray = Array.from(item.occurrences.values());
          const firstCheckedByWeek = new Map<string, number>();
          const occurrences = occurrenceArray
            .map((occurrence) => {
              const labels = describeOccurrence(
                occurrence.weekStartISO,
                occurrence.dayIndex,
              );
              const statusKeyByDay = `${occurrence.weekStartISO}::${occurrence.dayIndex}::${item.ingredientId}::${item.unit ?? ""}`;
              const statusKeyByWeek = `${occurrence.weekStartISO}::${item.ingredientId}::${item.unit ?? ""}`;
              const statusByDay = statusMap.get(statusKeyByDay);
              const statusByWeek = statusMap.get(statusKeyByWeek);
              const isChecked =
                statusByDay?.checked ?? statusByWeek?.checked ?? false;
              if (statusByWeek?.firstCheckedDayIndex != null) {
                firstCheckedByWeek.set(
                  occurrence.weekStartISO,
                  statusByWeek.firstCheckedDayIndex,
                );
              }
              return {
                weekStart: occurrence.weekStartISO,
                dayIndex: occurrence.dayIndex,
                dateISO: labels.dateISO,
                weekdayLabel: labels.weekdayLabel,
                longLabel: labels.longLabel,
                shortLabel: labels.shortLabel,
                quantity: occurrence.hasQuantity
                  ? occurrence.quantityTotal
                  : null,
                hasMissingQuantities: occurrence.hasMissing,
                checked: isChecked,
              };
            })
            .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

          const isItemChecked =
            occurrenceArray.length > 0
              ? occurrenceArray.every((occurrence) => {
                const statusKeyByDay = `${occurrence.weekStartISO}::${occurrence.dayIndex}::${item.ingredientId}::${item.unit ?? ""}`;
                const statusKeyByWeek = `${occurrence.weekStartISO}::${item.ingredientId}::${item.unit ?? ""}`;
                const statusByDay = statusMap.get(statusKeyByDay);
                const statusByWeek = statusMap.get(statusKeyByWeek);
                return statusByDay?.checked ?? statusByWeek?.checked ?? false;
              })
              : Array.from(item.weeks.values()).every(
                (weekIso) =>
                  statusMap.get(
                    `${weekIso}::${item.ingredientId}::${item.unit ?? ""}`,
                  )?.checked ?? false,
              );

          const firstCheckedOccurrences = Array.from(
            firstCheckedByWeek.entries(),
          ).map(([weekStartISO, dayIndex]) => ({
            weekStart: weekStartISO,
            dayIndex,
          }));

          return {
            ingredientId: item.ingredientId,
            name: item.name,
            unit: item.unit,
            category: item.category,
            totalQuantity: item.hasQuantities ? item.sumQuantity : null,
            hasMissingQuantities: item.hasMissingQuantities,
            details: item.details,
            weekStarts: Array.from(item.weeks.values()),
            occurrences,
            checked: isItemChecked,
            isPantryItem: item.isPantryItem,
            firstCheckedOccurrences,
          };
        })
        .sort((a, b) =>
          a.name.localeCompare(b.name, "nb", { sensitivity: "base" }),
        );

      // Include extra shopping items as a shared/global list across weeks.
      const extraItems = await prisma.extraShoppingItem.findMany({
        include: { catalogItem: true },
        orderBy: { updatedAt: "desc" },
      });
      const categoryByCatalogId = await fetchExtraCatalogCategoryMap(
        extraItems.map((item) => item.catalogItemId),
      );

      const seenCatalog = new Set<string>();
      const extras = extraItems
        .filter((item) => {
          if (seenCatalog.has(item.catalogItemId)) {
            return false;
          }
          seenCatalog.add(item.catalogItemId);
          return true;
        })
        .map((e) => {
          const category = categoryByCatalogId.get(e.catalogItemId) ?? null;
          return {
            id: e.id,
            name: e.catalogItem.name,
            weekStart: e.weekStart.toISOString(),
            checked: e.checked,
            updatedAt: e.updatedAt.toISOString(),
            category,
            hasCategory: category !== null,
          };
        });

      return {
        weekStart: weekStart.toISOString(),
        includedWeekStarts: weekStarts.map((week) => week.toISOString()),
        items,
        extras,
        plannedDays,
      };
    }),

  updateShoppingItem: publicProcedure
    .input(
      z.object({
        ingredientId: z.string().uuid(),
        unit: z.string().nullable().optional(),
        weeks: z.array(z.string()).optional(),
        occurrences: z
          .array(
            z.object({
              weekStart: z.string(),
              dayIndex: z.number().int().min(0).max(6),
            }),
          )
          .optional(),
        checked: z.boolean(),
      }),
    )
    .mutation(async ({ input }) => {
      const unitKey = input.unit ?? ""; // alltid string
      const weekMeta = new Map<number, { week: Date; dayIndices: number[] }>();

      for (const occurrence of input.occurrences ?? []) {
        const week = startOfWeek(occurrence.weekStart);
        const key = week.getTime();
        if (!weekMeta.has(key)) {
          weekMeta.set(key, { week, dayIndices: [] });
        }
        weekMeta.get(key)!.dayIndices.push(occurrence.dayIndex);
      }

      for (const week of input.weeks ?? []) {
        const normalized = startOfWeek(week);
        const key = normalized.getTime();
        if (!weekMeta.has(key)) {
          weekMeta.set(key, { week: normalized, dayIndices: [] });
        }
      }

      if (weekMeta.size === 0) {
        throw new Error("Mangler uke for oppdatering av handleliste");
      }

      const weekEntries = Array.from(weekMeta.values());

      await prisma.$transaction(
        weekEntries.map(({ week, dayIndices }) => {
          const firstDayIndex =
            input.checked && dayIndices.length > 0
              ? Math.min(...dayIndices)
              : null;

          const updateData: Prisma.ShoppingStateUpdateInput = {
            checked: input.checked,
          };

          if (input.checked) {
            if (dayIndices.length > 0) {
              updateData.firstCheckedDayIndex = firstDayIndex;
            }
          } else {
            updateData.firstCheckedDayIndex = null;
          }

          return prisma.shoppingState.upsert({
            where: {
              weekStart_ingredientId_unit: {
                weekStart: week,
                ingredientId: input.ingredientId,
                unit: unitKey, // endret fra null|string
              },
            },
            create: {
              weekStart: week,
              ingredientId: input.ingredientId,
              unit: unitKey, // endret fra null|string
              checked: input.checked,
              firstCheckedDayIndex: firstDayIndex,
            },
            update: updateData,
          });
        }),
      );

      return { ok: true };
    }),

  saveWeekPlan: publicProcedure
    .input(WeekPlanInput)
    .mutation(async ({ input }) => {
      const { weekStart: weekStartString, days } = input;
      if (days.length !== 7) {
        throw new Error("days must have length 7");
      }

      const weekStart = startOfWeek(weekStartString);
      enforceFutureLimit(weekStart);
      const persisted = await writeWeekPlan(weekStart, days);

      const pool = await fetchAllRecipes();
      const suggestions = buildSuggestionBuckets(pool, []);

      return composeWeekResponse({
        weekStart,
        updatedAt: persisted.plan.updatedAt,
        entries: persisted.entries,
        suggestions,
      });
    }),

  extraCatalogList: publicProcedure.query(async () => {
    const rows = await prisma.extraItemCatalog.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { extras: true } } },
    });
    const categoryMap = await fetchExtraCatalogCategoryMap(
      rows.map((item) => item.id),
    );
    return rows.map((item) => ({
      id: item.id,
      name: item.name,
      usageCount: item._count.extras,
      category: categoryMap.get(item.id) ?? null,
    }));
  }),

  extraCatalogBulkUpdateCategories: publicProcedure
    .input(ExtraCatalogBulkCategoryUpdate)
    .output(z.object({ count: z.number().int() }))
    .mutation(async ({ input }) => {
      let count = 0;

      for (const update of input.updates) {
        const normalizedCategory =
          normalizeOptionalIngredientCategory(update.category);
        try {
          const affectedRows =
            normalizedCategory == null
              ? await prisma.$executeRaw(
                Prisma.sql`
                  UPDATE "ExtraItemCatalog"
                  SET "category" = NULL
                  WHERE "id" = ${update.id}::uuid
                `,
              )
              : await prisma.$executeRaw(
                Prisma.sql`
                  UPDATE "ExtraItemCatalog"
                  SET "category" = ${normalizedCategory}::"IngredientCategory"
                  WHERE "id" = ${update.id}::uuid
                `,
              );
          if (Number(affectedRows) > 0) {
            count += 1;
          }
        } catch (_error: unknown) {
          // Skip records that cannot be updated so bulk operations continue.
        }
      }

      return { count };
    }),

  // Suggest extra items by prefix
  extraSuggest: publicProcedure
    .input(ExtraItemSuggest.optional())
    .query(async ({ input }) => {
      const q = (input?.search ?? "").trim();
      if (!q) {
        return [] as {
          id: string;
          name: string;
          category: IngredientCategoryKey | null;
          hasCategory: boolean;
        }[];
      }
      const all = await prisma.extraItemCatalog.findMany({
        where: { name: { contains: q } },
        orderBy: { name: "asc" },
        take: 20,
      });
      const categoryMap = await fetchExtraCatalogCategoryMap(
        all.map((item) => item.id),
      );
      return all.map((x) => {
        const category = categoryMap.get(x.id) ?? null;
        return {
          id: x.id,
          name: x.name,
          category,
          hasCategory: category !== null,
        };
      });
    }),

  // Add an extra item to the current week's list (upsert into catalog)
  extraAdd: publicProcedure
    .input(ExtraItemUpsert)
    .mutation(async ({ input }) => {
      const name = input.name.trim();
      const catalog = await prisma.extraItemCatalog.upsert({
        where: { name },
        update: {},
        create: { name },
      });
      return { id: catalog.id, name: catalog.name };
    }),

  // Toggle or set check on an extra item for a given week
  extraToggle: publicProcedure
    .input(ExtraShoppingToggle)
    .mutation(async ({ input }) => {
      const catalog = await prisma.extraItemCatalog.upsert({
        where: { name: input.name.trim() },
        update: {},
        create: { name: input.name.trim() },
      });
      const existing = await prisma.extraShoppingItem.findFirst({
        where: { catalogItemId: catalog.id },
        orderBy: { updatedAt: "desc" },
      });
      const checked = input.checked ?? !existing?.checked;

      const saved = await prisma.$transaction(async (tx) => {
        const globalRow = await tx.extraShoppingItem.upsert({
          where: {
            weekStart_catalogItemId: {
              weekStart: GLOBAL_EXTRA_WEEK_START,
              catalogItemId: catalog.id,
            },
          },
          create: {
            weekStart: GLOBAL_EXTRA_WEEK_START,
            catalogItemId: catalog.id,
            checked,
          },
          update: { checked },
        });

        await tx.extraShoppingItem.updateMany({
          where: {
            catalogItemId: catalog.id,
            NOT: { id: globalRow.id },
          },
          data: { checked },
        });

        return globalRow;
      });

      return { id: saved.id, checked: saved.checked };
    }),

  // Remove an extra item from a specific week (keeps catalog)
  extraRemove: publicProcedure
    .input(ExtraShoppingRemove)
    .mutation(async ({ input }) => {
      const catalog = await prisma.extraItemCatalog.findUnique({
        where: { name: input.name.trim() },
      });
      if (!catalog) return { ok: true };
      await prisma.extraShoppingItem.deleteMany({
        where: { catalogItemId: catalog.id },
      });
      return { ok: true };
    }),
});
