/**
 * Week plan generator.
 *
 * The goal is variation. Two presses of "generer" must produce visibly
 * different weeks, and no recipe should be able to lock itself onto the same
 * weekday week after week.
 *
 * The previous implementation scored every recipe deterministically and took
 * the arg-max, with a `Math.random() * 3` jitter that was far too small to
 * overcome deterministic gaps of 6-10 points. It also only looked one week
 * back, and filled days Monday-first so the weekend was always left with
 * whatever the quota filter had not consumed. The combination made a single
 * high `everydayScore` recipe win every Saturday forever.
 *
 * This implementation instead:
 *  1. decides the category shape of the week up front, so the weekend gets a
 *     real choice instead of leftovers,
 *  2. scores candidates against a multi-week history that knows *which
 *     weekday* a recipe was served on,
 *  3. samples from the top candidates with a softmax instead of taking the
 *     single best one, seeded so results stay reproducible in tests.
 */

export const MEAL_CATEGORY_KEYS = [
  "FISK",
  "VEGETAR",
  "KYLLING",
  "STORFE",
  "ANNET",
] as const;
export type MealCategoryKey = (typeof MEAL_CATEGORY_KEYS)[number];

/** Minimal shape the generator needs. `RecipeDTO` satisfies it structurally. */
export type GeneratorRecipe = {
  id: string;
  category: MealCategoryKey;
  everydayScore: number;
  healthScore: number;
  lastUsed: Date | null;
  usageCount: number;
  ingredients: { ingredientId: string; isPantryItem: boolean }[];
};

/** One historic meal, relative to the week being generated. */
export type PlannedMeal = {
  recipeId: string;
  dayIndex: number;
  /** Absolute distance in weeks from the week being generated. 1 = adjacent. */
  weeksAgo: number;
};

export type WeekGeneratorConfig = {
  fish: number;
  vegetarian: number;
  chicken: number;
  beef: number;
  preferRecentGapDays: number;
};

export type GenerateWeekOptions = {
  /** Meals from surrounding weeks, used to spread recipes out over time. */
  history?: PlannedMeal[];
  /** What the target week currently holds, so "generer" again gives something new. */
  avoidRecipeIds?: Iterable<string>;
  /** Anything stable hashes to a reproducible week. Omit for a random one. */
  seed?: number | string;
  /** Injectable clock, for tests. */
  now?: Date;
};

const DAYS_IN_WEEK = 7;
const DAY_MS = 86_400_000;

/** Friday and Saturday are the "weekend food" slots. Day 0 is Monday. */
const WEEKEND_DAYS = new Set([4, 5]);
const SUNDAY = 6;

/**
 * How many of the highest scoring candidates the sampler may draw from, and
 * how flat that draw is. Higher temperature = more variation, lower = more
 * obedient to the score. These two knobs are what make regeneration feel
 * different; everything else only decides *which* recipes are plausible.
 */
const CANDIDATE_POOL_SIZE = 8;
const SELECTION_TEMPERATURE = 1.6;

/**
 * Penalty by how many weeks ago the recipe was last planned. Index is weeks;
 * anything beyond the array is free. Served last week is close to disqualified.
 */
const REPEAT_PENALTY_BY_WEEK = [0, 16, 9, 5.5, 3.5, 2.2, 1.4, 0.8, 0.4];

/**
 * Extra penalty for landing on the *same weekday* as a recent outing. This is
 * what breaks the "asiatisk ribbe every Saturday" pattern: the recipe stays
 * available on other days, it just cannot own Saturday.
 */
const WEEKDAY_REPEAT_PENALTY_BY_WEEK = [0, 10, 6, 3.5, 2, 1.2, 0.7, 0.4, 0.2];

/** Softer version of the above for the whole category, so "Saturday = beef" also drifts. */
const CATEGORY_WEEKDAY_PENALTY_BY_WEEK = [0, 1.8, 1, 0.5];

const NEVER_PLANNED_BONUS = 3.5;
const MAX_RARITY_BONUS = 1.5;
const MAX_OVERLAP_CREDIT = 3;
const OVERLAP_BONUS_PER_INGREDIENT = 0.5;
const ADJACENT_CATEGORY_PENALTY = 2;
const SAME_RECIPE_ADJACENT_PENALTY = 10;
const CURRENTLY_PLANNED_PENALTY = 7;
const OVER_BUDGET_PENALTY = 1.5;

// ─── Randomness ───

export type Rng = () => number;

/** mulberry32 — small, fast, and good enough for shuffling dinner. */
function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function toSeed(seed: number | string | undefined): number {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    return Math.abs(Math.floor(seed)) >>> 0;
  }
  if (typeof seed === "string" && seed.length > 0) {
    // FNV-1a
    let hash = 2_166_136_261;
    for (let i = 0; i < seed.length; i += 1) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16_777_619);
    }
    return hash >>> 0;
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffff_ffff)) >>> 0;
}

export function createRng(seed?: number | string): Rng {
  return mulberry32(toSeed(seed));
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = result[i]!;
    const b = result[j]!;
    result[i] = b;
    result[j] = a;
  }
  return result;
}

/**
 * Draw one entry, weighted by `exp(score / temperature)`. Scores are shifted so
 * the best candidate sits at 0, which keeps `exp` away from overflow.
 */
function sampleByScore<T>(
  candidates: { item: T; score: number }[],
  rng: Rng,
  temperature: number,
): T | null {
  if (candidates.length === 0) return null;

  const best = candidates.reduce((max, c) => (c.score > max ? c.score : max), -Infinity);
  const weights = candidates.map((c) => Math.exp((c.score - best) / temperature));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (!Number.isFinite(total) || total <= 0) return candidates[0]!.item;

  let threshold = rng() * total;
  for (let i = 0; i < candidates.length; i += 1) {
    threshold -= weights[i]!;
    if (threshold <= 0) return candidates[i]!.item;
  }
  return candidates[candidates.length - 1]!.item;
}

/** Rank, keep the top `CANDIDATE_POOL_SIZE`, then sample among those. */
function pickFromScored<T>(candidates: { item: T; score: number }[], rng: Rng): T | null {
  const ranked = candidates
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, CANDIDATE_POOL_SIZE);
  return sampleByScore(ranked, rng, SELECTION_TEMPERATURE);
}

// ─── History ───

type HistoryIndex = {
  /** recipeId -> weeks since it was last planned */
  recipeWeeksAgo: Map<string, number>;
  /** `recipeId|dayIndex` -> weeks since it was last planned on that weekday */
  recipeDayWeeksAgo: Map<string, number>;
  /** `category|dayIndex` -> weeks since that category held that weekday */
  categoryDayWeeksAgo: Map<string, number>;
};

function keepClosest(map: Map<string, number>, key: string, weeksAgo: number) {
  const existing = map.get(key);
  if (existing === undefined || weeksAgo < existing) map.set(key, weeksAgo);
}

function indexHistory(
  history: PlannedMeal[],
  pool: GeneratorRecipe[],
): HistoryIndex {
  const categoryById = new Map(pool.map((recipe) => [recipe.id, recipe.category]));
  const index: HistoryIndex = {
    recipeWeeksAgo: new Map(),
    recipeDayWeeksAgo: new Map(),
    categoryDayWeeksAgo: new Map(),
  };

  for (const meal of history) {
    const weeksAgo = Math.max(1, Math.round(Math.abs(meal.weeksAgo)));
    keepClosest(index.recipeWeeksAgo, meal.recipeId, weeksAgo);
    keepClosest(index.recipeDayWeeksAgo, `${meal.recipeId}|${meal.dayIndex}`, weeksAgo);

    const category = categoryById.get(meal.recipeId);
    if (category) {
      keepClosest(index.categoryDayWeeksAgo, `${category}|${meal.dayIndex}`, weeksAgo);
    }
  }

  return index;
}

function penaltyFor(table: number[], weeksAgo: number | undefined): number {
  if (weeksAgo === undefined) return 0;
  return table[weeksAgo] ?? 0;
}

function daysSince(date: Date | null, now: Date): number {
  if (!date) return Infinity;
  return Math.floor((now.getTime() - date.getTime()) / DAY_MS);
}

// ─── Category layout ───

/**
 * Decide which category each day should aim for before picking any recipe.
 *
 * Doing this up front is what stops the weekend from getting leftovers: the
 * old generator walked Monday→Sunday and let the early days eat the quota, so
 * by Friday the "wants category" filter was empty and the weekend rule always
 * crowned the same comfort-food recipe.
 *
 * `null` means the day is unconstrained.
 */
function buildDayCategories(
  cfg: WeekGeneratorConfig,
  rng: Rng,
): (MealCategoryKey | null)[] {
  const requested = new Map<MealCategoryKey, number>([
    ["FISK", Math.max(0, Math.floor(cfg.fish))],
    ["VEGETAR", Math.max(0, Math.floor(cfg.vegetarian))],
    ["KYLLING", Math.max(0, Math.floor(cfg.chicken))],
    ["STORFE", Math.max(0, Math.floor(cfg.beef))],
  ]);

  // More targets than days: take the surplus off whichever category is asking
  // for the most, so a category that only wanted a single day keeps it.
  let total = Array.from(requested.values()).reduce((sum, n) => sum + n, 0);
  while (total > DAYS_IN_WEEK) {
    const largest = Math.max(...requested.values());
    const contenders = Array.from(requested.entries())
      .filter(([, count]) => count === largest)
      .map(([category]) => category);
    const victim = shuffle(contenders, rng)[0]!;
    requested.set(victim, largest - 1);
    total -= 1;
  }

  const slots: (MealCategoryKey | null)[] = [];
  for (const [category, count] of requested) {
    for (let i = 0; i < count; i += 1) slots.push(category);
  }
  while (slots.length < DAYS_IN_WEEK) slots.push(null);

  return assignSlotsToDays(slots, rng);
}

/**
 * Spread the slots across the week with a light affinity for sensible days,
 * kept loose so "fish day" and "beef day" move around from week to week.
 */
function slotDayAffinity(slot: MealCategoryKey | null, dayIndex: number): number {
  const isWeekend = WEEKEND_DAYS.has(dayIndex);
  if (slot === null) return dayIndex === SUNDAY ? 0.5 : 0;
  if (slot === "STORFE") return isWeekend ? 1 : 0;
  if (slot === "FISK") return isWeekend ? 0 : 0.8;
  if (slot === "VEGETAR") return isWeekend ? 0 : 0.5;
  return 0;
}

const LAYOUT_TEMPERATURE = 1.2;

function assignSlotsToDays(
  slots: (MealCategoryKey | null)[],
  rng: Rng,
): (MealCategoryKey | null)[] {
  const remaining = shuffle(slots, rng);
  const layout: (MealCategoryKey | null)[] = new Array(DAYS_IN_WEEK).fill(null);

  for (const dayIndex of shuffle([0, 1, 2, 3, 4, 5, 6], rng)) {
    if (remaining.length === 0) break;
    const scored = remaining.map((slot, position) => ({
      item: position,
      score: slotDayAffinity(slot, dayIndex),
    }));
    const chosen = sampleByScore(scored, rng, LAYOUT_TEMPERATURE) ?? 0;
    layout[dayIndex] = remaining[chosen] ?? null;
    remaining.splice(chosen, 1);
  }

  return layout;
}

// ─── Scoring ───

type ScoreContext = {
  cfg: WeekGeneratorConfig;
  history: HistoryIndex;
  layout: (MealCategoryKey | null)[];
  budgets: Record<MealCategoryKey, number>;
  usedIngredients: Set<string>;
  chosenByDay: (GeneratorRecipe | null)[];
  avoid: Set<string>;
  maxUsageCount: number;
  now: Date;
};

function categoryBudgets(cfg: WeekGeneratorConfig): Record<MealCategoryKey, number> {
  return {
    FISK: Math.max(0, Math.floor(cfg.fish)),
    VEGETAR: Math.max(0, Math.floor(cfg.vegetarian)),
    KYLLING: Math.max(0, Math.floor(cfg.chicken)),
    STORFE: Math.max(0, Math.floor(cfg.beef)),
    ANNET: DAYS_IN_WEEK,
  };
}

function scoreCandidate(
  recipe: GeneratorRecipe,
  dayIndex: number,
  ctx: ScoreContext,
): number {
  let score = 0;

  // How well the recipe fits the kind of day it is.
  if (WEEKEND_DAYS.has(dayIndex)) {
    score += recipe.everydayScore >= 4 ? 2.5 : recipe.everydayScore >= 3 ? 0.8 : -1.5;
  } else if (dayIndex === SUNDAY) {
    score += recipe.healthScore >= 3 ? 0.6 : 0;
    score += recipe.everydayScore >= 3 ? 0.6 : 0;
  } else {
    score += recipe.healthScore >= 4 ? 2 : recipe.healthScore >= 3 ? 0.7 : -0.8;
    score += recipe.everydayScore <= 3 ? 0.6 : 0;
  }

  // Time since this recipe was last on the table.
  const weeksAgo = ctx.history.recipeWeeksAgo.get(recipe.id);
  score -= penaltyFor(REPEAT_PENALTY_BY_WEEK, weeksAgo);
  if (weeksAgo === undefined) {
    score += NEVER_PLANNED_BONUS;
    // No plan history in the window, so fall back to the recipe's own stamp.
    // A negative value means it is already planned for a future week.
    const since = daysSince(recipe.lastUsed, ctx.now);
    if (since < 0 || since < 7) score -= 6;
    else if (since >= ctx.cfg.preferRecentGapDays) score += 1.5;
    else if (since >= 14) score += 0.5;
  }

  // Same weekday as a recent outing — the anti-"ribbe hver lørdag" term.
  score -= penaltyFor(
    WEEKDAY_REPEAT_PENALTY_BY_WEEK,
    ctx.history.recipeDayWeeksAgo.get(`${recipe.id}|${dayIndex}`),
  );
  score -= penaltyFor(
    CATEGORY_WEEKDAY_PENALTY_BY_WEEK,
    ctx.history.categoryDayWeeksAgo.get(`${recipe.category}|${dayIndex}`),
  );

  // Give rarely used recipes a nudge so the back of the collection surfaces.
  if (ctx.maxUsageCount > 0) {
    score += MAX_RARITY_BONUS * (1 - Math.min(1, recipe.usageCount / ctx.maxUsageCount));
  }

  // Shared ingredients keep the shopping list tight, but the credit is capped
  // and ignores pantry staples — uncapped overlap used to dominate every other
  // term and pull in a whole cluster of near-identical recipes.
  let overlap = 0;
  for (const ingredient of recipe.ingredients) {
    if (ingredient.isPantryItem) continue;
    if (ctx.usedIngredients.has(ingredient.ingredientId)) overlap += 1;
    if (overlap >= MAX_OVERLAP_CREDIT) break;
  }
  score += overlap * OVERLAP_BONUS_PER_INGREDIENT;

  // Unconstrained days should broaden the week rather than doubling down on a
  // category that already met its target. ANNET has no target, so it is never
  // over budget.
  if (recipe.category !== "ANNET") {
    const budget = ctx.budgets[recipe.category];
    const alreadyChosen = ctx.chosenByDay.filter(
      (chosen) => chosen?.category === recipe.category,
    ).length;
    if (alreadyChosen >= budget) {
      score -= OVER_BUDGET_PENALTY * (1 + alreadyChosen - budget);
    }
  }

  // Keep two dinners of the same category off neighbouring days, and the very
  // same dinner off two days running. The latter matters when the collection
  // is smaller than a week and the pool has to be reopened for repeats.
  for (const neighbour of [dayIndex - 1, dayIndex + 1]) {
    if (neighbour < 0 || neighbour >= DAYS_IN_WEEK) continue;
    const chosen = ctx.chosenByDay[neighbour];
    if (chosen && chosen.id === recipe.id) score -= SAME_RECIPE_ADJACENT_PENALTY;
    const neighbourCategory = chosen ? chosen.category : ctx.layout[neighbour];
    if (neighbourCategory && neighbourCategory === recipe.category) {
      score -= ADJACENT_CATEGORY_PENALTY;
    }
  }

  // What the week already contains, so pressing "generer" again moves on.
  if (ctx.avoid.has(recipe.id)) score -= CURRENTLY_PLANNED_PENALTY;

  return score;
}

// ─── Generation ───

/**
 * Build a seven-day plan. Days that cannot be filled from their assigned
 * category fall back to a free choice, and if the collection has fewer than
 * seven usable recipes the remaining days reuse recipes rather than failing.
 */
export function generateWeek<T extends GeneratorRecipe>(
  pool: T[],
  cfg: WeekGeneratorConfig,
  options: GenerateWeekOptions = {},
): T[] {
  if (pool.length === 0) {
    throw new Error("No recipes available for planner selection");
  }

  const rng = createRng(options.seed);
  const layout = buildDayCategories(cfg, rng);
  const ctx: ScoreContext = {
    cfg,
    history: indexHistory(options.history ?? [], pool),
    layout,
    budgets: categoryBudgets(cfg),
    usedIngredients: new Set<string>(),
    chosenByDay: new Array(DAYS_IN_WEEK).fill(null),
    avoid: new Set(options.avoidRecipeIds ?? []),
    maxUsageCount: pool.reduce((max, r) => Math.max(max, r.usageCount), 0),
    now: options.now ?? new Date(),
  };

  const usedRecipeIds = new Set<string>();

  // Fill the days that owe a category first, so their quota is not eaten by
  // the unconstrained days.
  const constrainedDays = [0, 1, 2, 3, 4, 5, 6].filter((day) => layout[day] !== null);
  const freeDays = [0, 1, 2, 3, 4, 5, 6].filter((day) => layout[day] === null);
  const fillOrder = [...shuffle(constrainedDays, rng), ...shuffle(freeDays, rng)];

  for (const dayIndex of fillOrder) {
    const wanted = layout[dayIndex];
    const unused = pool.filter((recipe) => !usedRecipeIds.has(recipe.id));

    // Prefer the assigned category; fall back to anything unused; and only
    // when the collection is exhausted, allow a repeat within the week.
    const inCategory = wanted ? unused.filter((r) => r.category === wanted) : [];
    const candidates =
      inCategory.length > 0 ? inCategory : unused.length > 0 ? unused : pool;

    const pick = pickFromScored(
      candidates.map((recipe) => ({
        item: recipe,
        score: scoreCandidate(recipe, dayIndex, ctx),
      })),
      rng,
    );
    if (!pick) throw new Error("Failed to select recipe for day");

    ctx.chosenByDay[dayIndex] = pick;
    usedRecipeIds.add(pick.id);
    for (const ingredient of pick.ingredients) {
      if (!ingredient.isPantryItem) ctx.usedIngredients.add(ingredient.ingredientId);
    }
  }

  return ctx.chosenByDay.map((recipe, dayIndex) => {
    if (!recipe) throw new Error(`Failed to select recipe for day ${dayIndex}`);
    return recipe as T;
  });
}
