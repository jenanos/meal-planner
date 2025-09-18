import { prisma } from "@repo/database";
import { router, publicProcedure } from "../trpc";
import { PlannerConstraints, WeekPlanInput } from "../schemas";
import { z } from "zod";

/** Day + meta (kan utvides senere) */
interface DayMeta {
  label: string;
}

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type DayIndex = typeof DAYS[number];

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
  category: string;
  everydayScore: number;
  healthScore: number;
  lastUsed: Date | null;
  usageCount: number;
  ingredients: { ingredientId: string; name: string }[];
};

type WeekPlanSuggestionBuckets = {
  longGap: RecipeDTO[];
  frequent: RecipeDTO[];
};

type WeekPlanResponse = {
  weekStart: string;
  updatedAt: string | null;
  days: { dayIndex: DayIndex; recipe: RecipeDTO | null }[];
  suggestions: WeekPlanSuggestionBuckets;
};

function toDTO(r: any): RecipeDTO {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    everydayScore: r.everydayScore,
    healthScore: r.healthScore,
    lastUsed: r.lastUsed ?? null,
    usageCount: r.usageCount,
    ingredients: (r.ingredients ?? []).map((ri: any) => ({
      ingredientId: ri.ingredientId,
      name: ri.ingredient.name,
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
      limit: 6,
      exclude,
    }),
    frequent: buildSuggestions(pool, {
      kind: "frequent",
      limit: 6,
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

function countOccurrences(ids: string[]) {
  const map = new Map<string, number>();
  ids.forEach((id) => {
    map.set(id, (map.get(id) ?? 0) + 1);
  });
  return map;
}

const PAST_WEEKS_WINDOW = 4;
const FUTURE_WEEKS_LIMIT = 4;

type TxClient = Parameters<typeof prisma.$transaction>[0] extends (
  tx: infer T
) => Promise<any>
  ? T
  : never;

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

async function writeWeekPlan(weekStart: Date, recipeIds: (string | null)[]) {
  if (recipeIds.length !== 7) {
    throw new Error("recipeIds must have length 7");
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
    const prevCounts = countOccurrences(prevEntries.map((entry) => entry.recipeId));

    for (let i = 0 as DayIndex; i < recipeIds.length; i = (i + 1) as DayIndex) {
      const recipeId = recipeIds[i];
      const where = { weekPlanId_dayIndex: { weekPlanId: plan.id, dayIndex: i } };

      if (recipeId) {
        await tx.weekPlanEntry.upsert({
          where,
          update: { recipeId },
          create: { weekPlanId: plan.id, dayIndex: i, recipeId },
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

    const newCounts = countOccurrences(recipeIds.filter((id): id is string => Boolean(id)));
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
  entries: { dayIndex: number; recipe: any | null }[];
  suggestions: WeekPlanSuggestionBuckets;
}): WeekPlanResponse {
  const { weekStart, updatedAt, entries, suggestions } = args;
  const entryMap = new Map<number, RecipeDTO | null>();

  entries.forEach((entry) => {
    entryMap.set(
      entry.dayIndex,
      entry.recipe ? toDTO(entry.recipe) : null
    );
  });

  return {
    weekStart: weekStart.toISOString(),
    updatedAt: updatedAt ? updatedAt.toISOString() : null,
    days: DAYS.map((dayIndex) => ({
      dayIndex,
      recipe: entryMap.get(dayIndex) ?? null,
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
  target: Record<string, number>
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

  if ((target[r.category] ?? 0) <= 0 && r.category !== "ANNET") s -= 5;

  return s;
}

function resolveConstraints(input?: z.infer<typeof PlannerConstraints>) {
  return {
    fish: input?.fish ?? 2,
    vegetarian: input?.vegetarian ?? 3,
    chicken: input?.chicken ?? 1,
    beef: input?.beef ?? 1,
    preferRecentGapDays: input?.preferRecentGapDays ?? 21,
  };
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

  const entries = planWithEntries?.entries ?? [];
  const exclude = entries
    .map((entry) => entry.recipe?.id)
    .filter((id): id is string => Boolean(id));

  const suggestions = buildSuggestionBuckets(pool, exclude);

  return composeWeekResponse({
    weekStart,
    updatedAt: planWithEntries?.updatedAt ?? null,
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
      const usedIngredients = new Set<string>();
      const selected: (RecipeDTO | null)[] = [];
      const selectedIds = new Set<string>();

      const target: Record<string, number> = {
        FISK: cfg.fish,
        VEGETAR: cfg.vegetarian,
        KYLLING: cfg.chicken,
        STORFE: cfg.beef,
        ANNET: 0,
      };

      for (const dayIndex of DAYS) {
        const candidates = pool
          .filter((recipe) => !selectedIds.has(recipe.id))
          .filter((recipe) => (target[recipe.category] ?? 0) > 0 || recipe.category === "ANNET");

        const scored = candidates
          .map((recipe) => ({ recipe, score: scoreRecipe(recipe, dayIndex, cfg, usedIngredients, target) }))
          .sort((a, b) => b.score - a.score);

        const pick = scored.length ? scored[0].recipe : null;
        selected.push(pick);
        if (pick) {
          selectedIds.add(pick.id);
          target[pick.category] = Math.max(0, (target[pick.category] ?? 0) - 1);
          pick.ingredients.forEach((ingredient) => usedIngredients.add(ingredient.ingredientId));
        }
      }

      const recipeIds = selected.map((recipe) => recipe?.id ?? null);
      if (recipeIds.some((id) => !id)) {
        throw new Error("Failed to generate a full week plan");
      }

      const persisted = await writeWeekPlan(weekStart, recipeIds);

      const suggestions = buildSuggestionBuckets(
        pool,
        recipeIds.filter((id): id is string => Boolean(id))
      );

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

  saveWeekPlan: publicProcedure
    .input(WeekPlanInput)
    .mutation(async ({ input }) => {
      const { weekStart: weekStartString, recipeIdsByDay } = input;
      if (recipeIdsByDay.length !== 7) {
        throw new Error("recipeIdsByDay must have length 7");
      }

      const weekStart = startOfWeek(weekStartString);
      enforceFutureLimit(weekStart);
      const persisted = await writeWeekPlan(weekStart, recipeIdsByDay);

      const pool = await fetchAllRecipes();
      const suggestions = buildSuggestionBuckets(
        pool,
        recipeIdsByDay.filter((id): id is string => Boolean(id))
      );

      return composeWeekResponse({
        weekStart,
        updatedAt: persisted.plan.updatedAt,
        entries: persisted.entries,
        suggestions,
      });
    }),
});
