import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => {
  const mock = {
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
    weekIndex: { upsert: vi.fn() },
    weekPlan: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    weekPlanEntry: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    recipe: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    freezerItem: {
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
  };
  return { prismaMock: mock };
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

import { freezerChangesBetween, plannerRouter } from "../src/routers/planner";

const HOUSEHOLD_ID = "00000000-0000-0000-0000-000000000100";
const USER = {
  id: "00000000-0000-0000-0000-000000000101",
  email: "user@example.com",
  name: "Test User",
  role: "USER" as const,
};
const LAKS = "00000000-0000-0000-0000-000000000201";
const TACO = "00000000-0000-0000-0000-000000000202";
const LASAGNE = "00000000-0000-0000-0000-000000000203";

const NOW = new Date("2026-07-09T12:00:00.000Z");
const WEEK_ISO = "2026-07-06T00:00:00.000Z";

const createCaller = () =>
  plannerRouter.createCaller({ user: USER, householdId: HOUSEHOLD_ID });

/** The days the procedure wrote, by day index, from the mocked entry writes. */
function writtenDays() {
  const days: Record<number, unknown> = {};
  for (const [args] of prismaMock.weekPlanEntry.upsert.mock.calls) {
    days[args.create.dayIndex] = {
      type: args.create.entryType,
      recipeId: args.create.recipeId,
    };
  }
  for (const [args] of prismaMock.weekPlanEntry.deleteMany.mock.calls) {
    days[args.where.dayIndex] = { type: "EMPTY" };
  }
  return days;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);

  // Interactive transactions run the callback against the same mock client.
  prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
  prismaMock.$executeRaw.mockResolvedValue(1);
  prismaMock.weekIndex.upsert.mockResolvedValue({ id: "week-index-1" });
  prismaMock.weekPlan.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.weekPlan.upsert.mockResolvedValue({
    id: "plan-1",
    updatedAt: NOW,
  });
  // Stored week: Monday laks, Wednesday lasagne from the freezer.
  prismaMock.weekPlan.findUnique.mockResolvedValue({
    entries: [
      { dayIndex: 0, entryType: "RECIPE", recipeId: LAKS },
      { dayIndex: 2, entryType: "FREEZER", recipeId: LASAGNE },
    ],
  });
  prismaMock.weekPlanEntry.findMany.mockResolvedValue([]);
  prismaMock.recipe.findMany.mockResolvedValue([]);
  prismaMock.recipe.findUniqueOrThrow.mockResolvedValue({ category: "STORFE" });
  prismaMock.freezerItem.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.freezerItem.deleteMany.mockResolvedValue({ count: 0 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("freezerChangesBetween", () => {
  it("takes portions out for added freezer days and returns them for removed ones", () => {
    const changes = freezerChangesBetween(
      [
        { type: "FREEZER", recipeId: LASAGNE },
        { type: "FREEZER", recipeId: TACO },
        { type: "RECIPE", recipeId: LAKS },
      ],
      [
        { type: "RECIPE", recipeId: LASAGNE },
        { type: "FREEZER", recipeId: TACO },
        { type: "FREEZER", recipeId: TACO },
      ],
    );

    expect(changes).toEqual([
      { recipeId: LASAGNE, portions: 1 },
      { recipeId: TACO, portions: -1 },
    ]);
  });

  it("is empty when the same freezer meal only moves to another day", () => {
    expect(
      freezerChangesBetween(
        [{ type: "FREEZER", recipeId: TACO }, { type: "EMPTY" }],
        [{ type: "EMPTY" }, { type: "FREEZER", recipeId: TACO }],
      ),
    ).toEqual([]);
  });
});

describe("planner.setWeekPlanDays", () => {
  it("merges the changes into the stored week inside a locked transaction", async () => {
    const result = await createCaller().setWeekPlanDays({
      weekStart: WEEK_ISO,
      changes: [
        { dayIndex: 4, type: "RECIPE", recipeId: TACO },
        { dayIndex: 5, type: "TAKEAWAY" },
      ],
    });

    // The lock is taken before the week is read, so the merge starts from
    // whatever a competing change left behind.
    expect(prismaMock.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      prismaMock.weekPlan.findUnique.mock.invocationCallOrder[0]!,
    );
    expect(writtenDays()).toEqual({
      0: { type: "RECIPE", recipeId: LAKS },
      1: { type: "EMPTY" },
      2: { type: "FREEZER", recipeId: LASAGNE },
      3: { type: "EMPTY" },
      4: { type: "RECIPE", recipeId: TACO },
      5: { type: "TAKEAWAY", recipeId: null },
      6: { type: "EMPTY" },
    });
    // No freezer day was added or removed.
    expect(result.freezerChanges).toEqual([]);
    expect(prismaMock.freezerItem.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.freezerItem.upsert).not.toHaveBeenCalled();
  });

  it("moves freezer portions in the same transaction as the plan", async () => {
    const result = await createCaller().setWeekPlanDays({
      weekStart: WEEK_ISO,
      changes: [
        // Lasagne goes back into the freezer, a taco portion comes out.
        { dayIndex: 2, type: "EMPTY" },
        { dayIndex: 3, type: "FREEZER", recipeId: TACO },
      ],
    });

    expect(result.freezerChanges).toEqual([
      { recipeId: LASAGNE, portions: 1 },
      { recipeId: TACO, portions: -1 },
    ]);
    expect(prismaMock.freezerItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          recipeId_householdId: {
            recipeId: LASAGNE,
            householdId: HOUSEHOLD_ID,
          },
        },
        update: { quantity: { increment: 1 } },
      }),
    );
    expect(prismaMock.freezerItem.updateMany).toHaveBeenCalledWith({
      where: { recipeId: TACO, householdId: HOUSEHOLD_ID, quantity: { gt: 1 } },
      data: { quantity: { decrement: 1 } },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it("removes the freezer entry when the last portion is planned", async () => {
    prismaMock.freezerItem.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.freezerItem.deleteMany.mockResolvedValue({ count: 1 });

    await createCaller().setWeekPlanDays({
      weekStart: WEEK_ISO,
      changes: [{ dayIndex: 3, type: "FREEZER", recipeId: TACO }],
    });

    expect(prismaMock.freezerItem.deleteMany).toHaveBeenCalledWith({
      where: { recipeId: TACO, householdId: HOUSEHOLD_ID, quantity: 1 },
    });
    expect(prismaMock.weekPlan.upsert).toHaveBeenCalled();
  });

  it("fails without touching the plan when the freezer has too few portions", async () => {
    prismaMock.freezerItem.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.freezerItem.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.recipe.findUnique.mockResolvedValue({ name: "Taco" });
    prismaMock.freezerItem.findUnique.mockResolvedValue(null);

    await expect(
      createCaller().setWeekPlanDays({
        weekStart: WEEK_ISO,
        changes: [{ dayIndex: 3, type: "FREEZER", recipeId: TACO }],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Ikke nok porsjoner av «Taco» i fryseren: trenger 1, har 0.",
    });

    // The error leaves the transaction before anything about the plan is
    // written, so the database rolls the whole change back.
    expect(prismaMock.weekPlan.upsert).not.toHaveBeenCalled();
    expect(prismaMock.weekPlanEntry.upsert).not.toHaveBeenCalled();
  });

  it("leaves the freezer alone when asked to", async () => {
    const result = await createCaller().setWeekPlanDays({
      weekStart: WEEK_ISO,
      changes: [{ dayIndex: 3, type: "FREEZER", recipeId: TACO }],
      syncFreezer: false,
    });

    expect(result.freezerChanges).toEqual([]);
    expect(prismaMock.freezerItem.updateMany).not.toHaveBeenCalled();
    expect(writtenDays()[3]).toEqual({ type: "FREEZER", recipeId: TACO });
  });

  it("rejects the same day twice and weeks beyond the horizon up front", async () => {
    await expect(
      createCaller().setWeekPlanDays({
        weekStart: WEEK_ISO,
        changes: [
          { dayIndex: 1, type: "EMPTY" },
          { dayIndex: 1, type: "TAKEAWAY" },
        ],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      createCaller().setWeekPlanDays({
        weekStart: "2027-01-04T00:00:00.000Z",
        changes: [{ dayIndex: 1, type: "EMPTY" }],
      }),
    ).rejects.toThrow(/planleggingshorisont/);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("planner.generateWeekPlan", () => {
  it("returns replaced freezer meals to the freezer only when asked to", async () => {
    // The generator needs something to fill seven days with.
    prismaMock.weekPlan.findMany.mockResolvedValue([]);
    prismaMock.recipe.findMany.mockResolvedValue(
      Array.from({ length: 7 }, (_, i) => ({
        id: `00000000-0000-0000-0000-0000000009${String(i).padStart(2, "0")}`,
        name: `Rett ${i}`,
        category: "VEGETAR",
        everydayScore: 3,
        healthScore: 3,
        lastUsed: null,
        usageCount: 0,
        ingredients: [],
      })),
    );

    const withSync = await createCaller().generateWeekPlan({
      weekStart: WEEK_ISO,
      syncFreezer: true,
    });
    expect(withSync.freezerChanges).toEqual([
      { recipeId: LASAGNE, portions: 1 },
    ]);
    expect(prismaMock.freezerItem.upsert).toHaveBeenCalledTimes(1);

    prismaMock.freezerItem.upsert.mockClear();
    // The web app adjusts the inventory itself and does not pass the flag.
    const withoutSync = await createCaller().generateWeekPlan({
      weekStart: WEEK_ISO,
    });
    expect(withoutSync.freezerChanges).toEqual([]);
    expect(prismaMock.freezerItem.upsert).not.toHaveBeenCalled();
  });
});
