import { prisma, Prisma } from "@repo/database";
import { router, publicProcedure } from "../trpc.js";
import { PlannerConstraints, WeekPlanInput, ExtraItemSuggest, ExtraItemUpsert, ExtraShoppingToggle, ExtraShoppingRemove } from "../schemas.js";
import { z } from "zod";

/** Day + meta (kan utvides senere) */
interface DayMeta {
  label: string;
}

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type DayIndex = typeof DAYS[number];

const CATEGORY_KEYS = ["FISK", "VEGETAR", "KYLLING", "STORFE", "ANNET"] as const;
type MealCategoryKey = typeof CATEGORY_KEYS[number];

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
  days: { dayIndex: DayIndex; entryType: WeekEntryType; recipe: RecipeDTO | null }[];
  suggestions: WeekPlanSuggestionBuckets;
};

type WeekPlanDayEntryInput =
  | { type: "RECIPE"; recipeId: string }
  | { type: "TAKEAWAY" }
  | { type: "EMPTY" };

type PlannerConfig = ReturnType<typeof resolveConstraints>;

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
});

function buildSuggestions(
  pool: RecipeDTO[],
  opts: { kind: SuggestionKind; limit: number; exclude: string[]; search?: string }
) {
  const excl = new Set(opts.exclude);
  let cand = pool.filter((r) => !excl.has(r.id));

  if (opts.kind === "search" && opts.search) {
    const q = opts.search.toLowerCase();
    cand = cand.filter((r) => r.name.toLowerCase().includes(q));
  } else if (opts.kind === "longGap") {
    cand = cand.slice().sort((a, b) => daysSince(b.lastUsed) - daysSince(a.lastUsed));
  } else if (opts.kind === "frequent") {
    cand = cand.slice().sort((a, b) => b.usageCount - a.usageCount);
  }

  return cand.slice(0, opts.limit);
}

function buildSuggestionBuckets(pool: RecipeDTO[], exclude: string[]): WeekPlanSuggestionBuckets {
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
  const base = typeof value === "string" ? new Date(value) : value ?? new Date();
  if (Number.isNaN(base.getTime())) {
    throw new Error("Invalid date");
  }
  return base;
}

function startOfWeek(dateInput?: string | Date) {
  const date = ensureDate(dateInput);
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
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
    throw new Error("Uken ligger lenger frem i tid enn tillatt planleggingshorisont");
  }
}

async function ensureWeekIndex(client: TxClient | typeof prisma, weekStart: Date) {
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

  for (let offset = -PAST_WEEKS_WINDOW; offset <= FUTURE_WEEKS_LIMIT; offset += 1) {
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
        .map((entry) => entry.recipeId)
    );

    for (let i = 0 as DayIndex; i < days.length; i = (i + 1) as DayIndex) {
      const dayEntry = days[i];
      const where = { weekPlanId_dayIndex: { weekPlanId: plan.id, dayIndex: i } };

      if (dayEntry.type === "RECIPE") {
        await tx.weekPlanEntry.upsert({
          where,
          update: { recipeId: dayEntry.recipeId, entryType: "RECIPE" },
          create: { weekPlanId: plan.id, dayIndex: i, recipeId: dayEntry.recipeId, entryType: "RECIPE" },
        });
      } else if (dayEntry.type === "TAKEAWAY") {
        await tx.weekPlanEntry.upsert({
          where,
          update: { recipeId: null, entryType: "TAKEAWAY" },
          create: { weekPlanId: plan.id, dayIndex: i, recipeId: null, entryType: "TAKEAWAY" },
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
        .filter((entry): entry is { type: "RECIPE"; recipeId: string } => entry.type === "RECIPE")
        .map((entry) => entry.recipeId)
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
  entries: { dayIndex: number; recipe: any | null; entryType?: WeekEntryType }[];
  suggestions: WeekPlanSuggestionBuckets;
}): WeekPlanResponse {
  const { weekStart, updatedAt, entries, suggestions } = args;
  const entryMap = new Map<number, { entryType: WeekEntryType; recipe: RecipeDTO | null }>();

  entries.forEach((entry) => {
    entryMap.set(
      entry.dayIndex,
      {
        entryType: entry.entryType ?? (entry.recipe ? "RECIPE" : "EMPTY"),
        recipe: entry.recipe ? toDTO(entry.recipe) : null,
      }
    );
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
  target: Record<MealCategoryKey, number>
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
    (acc, ingredient) => acc + (usedIngredients.has(ingredient.ingredientId) ? 1 : 0),
    0
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
    const candidates = (prioritized.length ? prioritized : available).map((recipe) => ({
      recipe,
      score: scoreRecipe(recipe, dayIndex, cfg, usedIngredients, target),
    }));

    const pick = candidates.sort((a, b) => b.score - a.score)[0]?.recipe;
    if (!pick) {
      throw new Error("Failed to select recipe for day");
    }

    selected.push(pick);
    target[pick.category] = Math.max(0, target[pick.category] - 1);
    pick.ingredients.forEach((ingredient) => usedIngredients.add(ingredient.ingredientId));
  }

  return selected;
}

type SimpleRecipeInput = { id: string; diet: string } & Record<string, unknown>;

function normalizeDiet(value: string): MealCategoryKey {
  const upper = value.toUpperCase();
  if (upper === "MEAT" || upper === "BEEF" || upper === "STORFE") return "STORFE";
  if (upper === "CHICKEN" || upper === "KYLLING") return "KYLLING";
  if (upper === "FISH" || upper === "FISK") return "FISK";
  if (upper === "VEG" || upper === "VEGETAR" || upper === "VEGETARIAN") return "VEGETAR";
  return "ANNET";
}

export function selectRecipes(recipes: SimpleRecipeInput[], targets: Record<string, number>) {
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

async function ensureWeekPlanResponse(weekStart: Date): Promise<WeekPlanResponse> {
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
      const days = selected.map((recipe) => ({ type: "RECIPE" as const, recipeId: recipe.id }));
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
      const days = selected.map((recipe) => ({ type: "RECIPE" as const, recipeId: recipe.id }));
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
      const windowEnd = futureEndCandidate.getTime() > maxFuture.getTime() ? maxFuture : futureEndCandidate;

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
        updatedAt: item.plan?.updatedAt ? item.plan.updatedAt.toISOString() : null,
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

  shoppingList: publicProcedure
    .input(shoppingListInputSchema.optional())
    .query(async ({ input }) => {
      const args = shoppingListInputSchema.parse(input ?? {});
      const targetWeek = startOfWeek(args.weekStart);
      const weekStart = clampToFutureLimit(targetWeek);
      const includeNextWeek = Boolean(args.includeNextWeek);

      const weekStarts: Date[] = [weekStart];
      if (includeNextWeek) {
        const nextWeek = addWeeks(weekStart, 1);
        const maxFuture = maxAllowedFutureWeek();
        if (nextWeek.getTime() <= maxFuture.getTime()) {
          weekStarts.push(nextWeek);
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

      const items = Array.from(map.values())
        .map((item) => {
          const occurrenceArray = Array.from(item.occurrences.values());
          const firstCheckedByWeek = new Map<string, number>();
          const occurrences = occurrenceArray
            .map((occurrence) => {
              const labels = describeOccurrence(occurrence.weekStartISO, occurrence.dayIndex);
              const statusKeyByDay = `${occurrence.weekStartISO}::${occurrence.dayIndex}::${item.ingredientId}::${item.unit ?? ""}`;
              const statusKeyByWeek = `${occurrence.weekStartISO}::${item.ingredientId}::${item.unit ?? ""}`;
              const statusByDay = statusMap.get(statusKeyByDay);
              const statusByWeek = statusMap.get(statusKeyByWeek);
              const isChecked = statusByDay?.checked ?? statusByWeek?.checked ?? false;
              if (statusByWeek?.firstCheckedDayIndex != null) {
                firstCheckedByWeek.set(
                  occurrence.weekStartISO,
                  statusByWeek.firstCheckedDayIndex
                );
              }
              return {
                weekStart: occurrence.weekStartISO,
                dayIndex: occurrence.dayIndex,
                dateISO: labels.dateISO,
                weekdayLabel: labels.weekdayLabel,
                longLabel: labels.longLabel,
                shortLabel: labels.shortLabel,
                quantity: occurrence.hasQuantity ? occurrence.quantityTotal : null,
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
              : Array.from(item.weeks.values()).every((weekIso) =>
                  statusMap.get(`${weekIso}::${item.ingredientId}::${item.unit ?? ""}`)?.checked ??
                  false
                );

          const firstCheckedOccurrences = Array.from(firstCheckedByWeek.entries()).map(
            ([weekStartISO, dayIndex]) => ({
              weekStart: weekStartISO,
              dayIndex,
            })
          );

          return {
            ingredientId: item.ingredientId,
            name: item.name,
            unit: item.unit,
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
        .sort((a, b) => a.name.localeCompare(b.name, "nb", { sensitivity: "base" }));

      // Include extra shopping items for these weeks
      const extraItems = await prisma.extraShoppingItem.findMany({
        where: { weekStart: { in: weekStarts } },
        include: { catalogItem: true },
        orderBy: { createdAt: "asc" },
      });

      const extras = extraItems.map((e) => ({
        id: e.id,
        name: e.catalogItem.name,
        weekStart: e.weekStart.toISOString(),
        checked: e.checked,
      }));

      return {
        weekStart: weekStart.toISOString(),
        includedWeekStarts: weekStarts.map((week) => week.toISOString()),
        items,
        extras,
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
            })
          )
          .optional(),
        checked: z.boolean(),
      })
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
        })
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

  // Suggest extra items by prefix
  extraSuggest: publicProcedure
    .input(ExtraItemSuggest.optional())
    .query(async ({ input }) => {
      const q = (input?.search ?? "").trim();
      if (!q) return [] as { id: string; name: string }[];
      const all = await prisma.extraItemCatalog.findMany({
        where: { name: { contains: q } },
        orderBy: { name: "asc" },
        take: 20,
      });
      return all.map((x) => ({ id: x.id, name: x.name }));
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
      const week = startOfWeek(input.weekStart);
      enforceFutureLimit(week);
      const catalog = await prisma.extraItemCatalog.upsert({
        where: { name: input.name.trim() },
        update: {},
        create: { name: input.name.trim() },
      });
      const existing = await prisma.extraShoppingItem.findUnique({
        where: { weekStart_catalogItemId: { weekStart: week, catalogItemId: catalog.id } },
      });
      const checked = input.checked ?? !existing?.checked;
      const saved = await prisma.extraShoppingItem.upsert({
        where: { weekStart_catalogItemId: { weekStart: week, catalogItemId: catalog.id } },
        create: { weekStart: week, catalogItemId: catalog.id, checked },
        update: { checked },
      });
      return { id: saved.id, checked: saved.checked };
    }),

  // Remove an extra item from a specific week (keeps catalog)
  extraRemove: publicProcedure
    .input(ExtraShoppingRemove)
    .mutation(async ({ input }) => {
      const week = startOfWeek(input.weekStart);
      const catalog = await prisma.extraItemCatalog.findUnique({ where: { name: input.name.trim() } });
      if (!catalog) return { ok: true };
      await prisma.extraShoppingItem.deleteMany({ where: { weekStart: week, catalogItemId: catalog.id } });
      return { ok: true };
    }),
});
