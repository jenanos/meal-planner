import { describe, it, expect } from "vitest";
import {
  generateWeek,
  type GeneratorRecipe,
  type MealCategoryKey,
  type PlannedMeal,
  type WeekGeneratorConfig,
} from "../src/week-generator";

const SATURDAY = 5;

const DEFAULT_CFG: WeekGeneratorConfig = {
  fish: 2,
  vegetarian: 1,
  chicken: 1,
  beef: 1,
  preferRecentGapDays: 21,
};

const NO_QUOTA: WeekGeneratorConfig = {
  fish: 0,
  vegetarian: 0,
  chicken: 0,
  beef: 0,
  preferRecentGapDays: 21,
};

function makeRecipe(
  id: string,
  category: MealCategoryKey,
  overrides: Partial<GeneratorRecipe> = {},
): GeneratorRecipe {
  return {
    id,
    category,
    everydayScore: 3,
    healthScore: 3,
    lastUsed: null,
    usageCount: 0,
    ingredients: [],
    ...overrides,
  };
}

/** A realistic-ish collection: 6 fish, 5 veg, 5 chicken, 5 beef, 4 other. */
function makePool(): GeneratorRecipe[] {
  const spec: [string, MealCategoryKey, number][] = [
    ["fisk", "FISK", 6],
    ["veg", "VEGETAR", 5],
    ["kyll", "KYLLING", 5],
    ["storfe", "STORFE", 5],
    ["annet", "ANNET", 4],
  ];
  return spec.flatMap(([prefix, category, count]) =>
    Array.from({ length: count }, (_, i) =>
      makeRecipe(`${prefix}-${i}`, category, {
        everydayScore: (i % 5) + 1,
        healthScore: ((i + 2) % 5) + 1,
      }),
    ),
  );
}

function countByCategory(week: GeneratorRecipe[]) {
  return week.reduce<Record<string, number>>((acc, recipe) => {
    acc[recipe.category] = (acc[recipe.category] ?? 0) + 1;
    return acc;
  }, {});
}

/** Generate `count` consecutive weeks, feeding each one the weeks before it. */
function simulateWeeks(
  pool: GeneratorRecipe[],
  cfg: WeekGeneratorConfig,
  count: number,
  seedPrefix = "week",
): string[][] {
  const weeks: string[][] = [];
  for (let w = 0; w < count; w += 1) {
    const history: PlannedMeal[] = [];
    weeks.forEach((week, index) => {
      week.forEach((recipeId, dayIndex) => {
        history.push({ recipeId, dayIndex, weeksAgo: w - index });
      });
    });
    const plan = generateWeek(pool, cfg, { history, seed: `${seedPrefix}-${w}` });
    weeks.push(plan.map((recipe) => recipe.id));
  }
  return weeks;
}

describe("generateWeek", () => {
  it("returns one recipe per day", () => {
    const week = generateWeek(makePool(), DEFAULT_CFG, { seed: "a" });
    expect(week).toHaveLength(7);
    expect(new Set(week.map((r) => r.id)).size).toBe(7);
  });

  it("throws when there is nothing to plan", () => {
    expect(() => generateWeek([], DEFAULT_CFG)).toThrow(/No recipes available/);
  });

  it("is reproducible for a given seed and different across seeds", () => {
    const pool = makePool();
    const a = generateWeek(pool, DEFAULT_CFG, { seed: "same" }).map((r) => r.id);
    const b = generateWeek(pool, DEFAULT_CFG, { seed: "same" }).map((r) => r.id);
    expect(b).toEqual(a);

    const distinct = new Set(
      Array.from({ length: 20 }, (_, i) =>
        generateWeek(pool, DEFAULT_CFG, { seed: `seed-${i}` })
          .map((r) => r.id)
          .join("|"),
      ),
    );
    expect(distinct.size).toBe(20);
  });

  it("does not mutate the pool it is given", () => {
    const pool = makePool();
    const snapshot = pool.map((r) => r.id);
    generateWeek(pool, DEFAULT_CFG, { seed: "a" });
    expect(pool.map((r) => r.id)).toEqual(snapshot);
  });

  it("meets the category targets when the collection allows it", () => {
    const pool = makePool();
    // Targets are minimums: five of the seven days are spoken for, and the
    // remaining two are free to go wherever the week needs them.
    for (let i = 0; i < 25; i += 1) {
      const counts = countByCategory(
        generateWeek(pool, DEFAULT_CFG, { seed: `target-${i}` }),
      );
      expect(counts.FISK ?? 0).toBeGreaterThanOrEqual(DEFAULT_CFG.fish);
      expect(counts.VEGETAR ?? 0).toBeGreaterThanOrEqual(DEFAULT_CFG.vegetarian);
      expect(counts.KYLLING ?? 0).toBeGreaterThanOrEqual(DEFAULT_CFG.chicken);
      expect(counts.STORFE ?? 0).toBeGreaterThanOrEqual(DEFAULT_CFG.beef);
    }
  });

  it("mostly spends the free days outside the categories that are already met", () => {
    const pool = makePool();
    const RUNS = 60;
    let overshoot = 0;
    for (let i = 0; i < RUNS; i += 1) {
      const counts = countByCategory(
        generateWeek(pool, DEFAULT_CFG, { seed: `budget-${i}` }),
      );
      overshoot +=
        Math.max(0, (counts.FISK ?? 0) - DEFAULT_CFG.fish) +
        Math.max(0, (counts.VEGETAR ?? 0) - DEFAULT_CFG.vegetarian) +
        Math.max(0, (counts.KYLLING ?? 0) - DEFAULT_CFG.chicken) +
        Math.max(0, (counts.STORFE ?? 0) - DEFAULT_CFG.beef);
    }
    // Two free days per week, so at most 2.0 without the budget term steering.
    expect(overshoot / RUNS).toBeLessThan(1.5);
  });

  it("fills days with other categories when a target cannot be met", () => {
    // Only two fish recipes exist, but three fish days are requested.
    const pool = [
      makeRecipe("f1", "FISK"),
      makeRecipe("f2", "FISK"),
      makeRecipe("v1", "VEGETAR"),
      makeRecipe("b1", "STORFE"),
      makeRecipe("b2", "STORFE"),
      makeRecipe("b3", "STORFE"),
      makeRecipe("b4", "STORFE"),
    ];
    const week = generateWeek(
      pool,
      { ...NO_QUOTA, fish: 3, vegetarian: 2 },
      { seed: "short" },
    );
    expect(week).toHaveLength(7);
    expect(countByCategory(week)).toEqual({ FISK: 2, VEGETAR: 1, STORFE: 4 });
  });

  it("reuses recipes only when the collection is smaller than a week", () => {
    const pool = Array.from({ length: 5 }, (_, i) => makeRecipe(`r${i}`, "ANNET"));
    const week = generateWeek(pool, NO_QUOTA, { seed: "small" });
    expect(week).toHaveLength(7);
    expect(new Set(week.map((r) => r.id)).size).toBe(5);
  });

  it("keeps a recipe off the weekday it was recently served on", () => {
    // Every recipe was planned two weeks ago, so the general repeat penalty is
    // identical across the pool and the weekday term is the only thing that
    // separates "sat" (served on a Saturday) from "mon" (served on a Monday).
    const others = Array.from({ length: 8 }, (_, i) => makeRecipe(`r${i}`, "ANNET"));
    const pool = [...others, makeRecipe("sat", "ANNET"), makeRecipe("mon", "ANNET")];

    const history: PlannedMeal[] = [
      { recipeId: "sat", dayIndex: SATURDAY, weeksAgo: 2 },
      { recipeId: "mon", dayIndex: 0, weeksAgo: 2 },
      ...others.map((recipe, i) => ({
        recipeId: recipe.id,
        dayIndex: i % 7,
        weeksAgo: 2,
      })),
    ];

    let satOnSaturday = 0;
    let monOnSaturday = 0;
    const RUNS = 300;
    for (let i = 0; i < RUNS; i += 1) {
      const week = generateWeek(pool, NO_QUOTA, { history, seed: `wd-${i}` });
      if (week[SATURDAY]!.id === "sat") satOnSaturday += 1;
      if (week[SATURDAY]!.id === "mon") monOnSaturday += 1;
    }

    // Same global history, so the only difference is which weekday they held.
    expect(satOnSaturday).toBeLessThan(monOnSaturday);
  });

  it("pushes recently served recipes to the back of the queue", () => {
    const pool = Array.from({ length: 14 }, (_, i) => makeRecipe(`r${i}`, "ANNET"));
    const history: PlannedMeal[] = [0, 1, 2, 3, 4, 5, 6].map((dayIndex) => ({
      recipeId: `r${dayIndex}`,
      dayIndex,
      weeksAgo: 1,
    }));

    let lastWeeksRecipes = 0;
    const RUNS = 50;
    for (let i = 0; i < RUNS; i += 1) {
      const week = generateWeek(pool, NO_QUOTA, { history, seed: `recent-${i}` });
      lastWeeksRecipes += week.filter((r) => Number(r.id.slice(1)) < 7).length;
    }
    // Seven fresh recipes are available, so last week's should barely appear.
    expect(lastWeeksRecipes / RUNS).toBeLessThan(1);
  });

  it("moves on from what the week already contains when regenerating", () => {
    const pool = makePool();
    const current = generateWeek(pool, DEFAULT_CFG, { seed: "first" }).map((r) => r.id);

    let overlap = 0;
    const RUNS = 30;
    for (let i = 0; i < RUNS; i += 1) {
      const regenerated = generateWeek(pool, DEFAULT_CFG, {
        avoidRecipeIds: current,
        seed: `again-${i}`,
      });
      overlap += regenerated.filter((r) => current.includes(r.id)).length;
    }
    expect(overlap / RUNS).toBeLessThan(1.5);
  });

  it("prefers recipes that have never been planned", () => {
    const pool = [
      ...Array.from({ length: 7 }, (_, i) =>
        makeRecipe(`favourite-${i}`, "ANNET", { usageCount: 40 }),
      ),
      ...Array.from({ length: 7 }, (_, i) => makeRecipe(`neglected-${i}`, "ANNET")),
    ];
    const history: PlannedMeal[] = [];
    for (let week = 1; week <= 6; week += 1) {
      for (let day = 0; day < 7; day += 1) {
        history.push({ recipeId: `favourite-${day}`, dayIndex: day, weeksAgo: week });
      }
    }

    let neglected = 0;
    const RUNS = 30;
    for (let i = 0; i < RUNS; i += 1) {
      const week = generateWeek(pool, NO_QUOTA, { history, seed: `neglect-${i}` });
      neglected += week.filter((r) => r.id.startsWith("neglected")).length;
    }
    expect(neglected / RUNS).toBeGreaterThan(6);
  });

  it("treats a future lastUsed as recently served", () => {
    // Planning a week ahead stamps `lastUsed` in the future; that must read as
    // "already spoken for", not as "ages since we had it".
    const now = new Date("2026-08-10T00:00:00.000Z");
    const pool = [
      ...Array.from({ length: 7 }, (_, i) =>
        makeRecipe(`soon-${i}`, "ANNET", { lastUsed: new Date("2026-08-24T00:00:00.000Z") }),
      ),
      ...Array.from({ length: 7 }, (_, i) => makeRecipe(`free-${i}`, "ANNET")),
    ];

    let soon = 0;
    const RUNS = 30;
    for (let i = 0; i < RUNS; i += 1) {
      const week = generateWeek(pool, NO_QUOTA, { seed: `future-${i}`, now });
      soon += week.filter((r) => r.id.startsWith("soon")).length;
    }
    expect(soon / RUNS).toBeLessThan(1);
  });

  describe("over a run of consecutive weeks", () => {
    const pool = makePool();
    const weeks = simulateWeeks(pool, DEFAULT_CFG, 12);

    it("works its way through the whole collection", () => {
      const used = new Set(weeks.flat());
      expect(used.size).toBe(pool.length);
    });

    it("never lets one recipe own a weekday", () => {
      const perWeekday = new Map<string, number>();
      weeks.forEach((week) => {
        week.forEach((id, dayIndex) => {
          const key = `${id}|${dayIndex}`;
          perWeekday.set(key, (perWeekday.get(key) ?? 0) + 1);
        });
      });
      // The old generator served the same dish on the same weekday 7 weeks out
      // of 12; anything close to that is the bug coming back.
      expect(Math.max(...perWeekday.values())).toBeLessThanOrEqual(3);
    });

    it("varies the weekend", () => {
      const saturdays = weeks.map((week) => week[SATURDAY]!);
      expect(new Set(saturdays).size).toBeGreaterThanOrEqual(7);
    });

    it("does not lean on a handful of favourites", () => {
      const counts = new Map<string, number>();
      weeks.flat().forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(6);
    });
  });
});
