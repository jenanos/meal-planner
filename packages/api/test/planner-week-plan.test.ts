import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => {
  return {
    prismaMock: {
      weekIndex: {
        upsert: vi.fn(),
      },
      weekPlan: {
        updateMany: vi.fn(),
        findUnique: vi.fn(),
      },
      recipe: {
        findMany: vi.fn(),
      },
    },
  };
});

vi.mock("@repo/database", () => ({
  prisma: prismaMock,
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    }),
    join: (values: unknown[]) => ({ values }),
  },
}));

import { plannerRouter } from "../src/routers/planner";

const HOUSEHOLD_ID = "00000000-0000-0000-0000-000000000100";
const USER = {
  id: "00000000-0000-0000-0000-000000000101",
  email: "user@example.com",
  name: "Test User",
  role: "USER" as const,
};

const NOW = new Date("2026-07-09T12:00:00.000Z");
const WEEK_START = new Date("2026-07-06T00:00:00.000Z");
const WEEK_ISO = WEEK_START.toISOString();

const PASTA_RECIPE = {
  id: "00000000-0000-0000-0000-000000000201",
  name: "Grønnsakspasta",
  description: "Kok pastaen, stek grønnsakene og bland alt sammen.",
  category: "VEGETAR",
  everydayScore: 4,
  healthScore: 5,
  lastUsed: null,
  usageCount: 2,
  ingredients: [
    {
      ingredientId: "00000000-0000-0000-0000-000000000301",
      quantity: 1,
      notes: null,
      ingredient: {
        name: "gul løk",
        unit: "stk",
        isPantryItem: false,
        category: "GRONNSAKER",
      },
    },
  ],
};

const createCaller = () =>
  plannerRouter.createCaller({ user: USER, householdId: HOUSEHOLD_ID });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  prismaMock.weekIndex.upsert.mockResolvedValue({ id: "week-index-1" });
  prismaMock.weekPlan.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.recipe.findMany.mockResolvedValue([PASTA_RECIPE]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("planner.getWeekPlan", () => {
  it("includes the recipe description so the planner can show it", async () => {
    prismaMock.weekPlan.findUnique.mockResolvedValueOnce({
      updatedAt: NOW,
      entries: [{ dayIndex: 0, entryType: "RECIPE", recipe: PASTA_RECIPE }],
    });

    const result = await createCaller().getWeekPlan({ weekStart: WEEK_ISO });

    const day = result.days.find((entry) => entry.dayIndex === 0);
    expect(day?.recipe?.description).toBe(PASTA_RECIPE.description);
  });

  it("leaves the description undefined when the recipe has none", async () => {
    prismaMock.weekPlan.findUnique.mockResolvedValueOnce({
      updatedAt: NOW,
      entries: [
        {
          dayIndex: 0,
          entryType: "RECIPE",
          recipe: { ...PASTA_RECIPE, description: null },
        },
      ],
    });

    const result = await createCaller().getWeekPlan({ weekStart: WEEK_ISO });

    const day = result.days.find((entry) => entry.dayIndex === 0);
    expect(day?.recipe?.description).toBeUndefined();
  });
});
