import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => {
  return {
  prismaMock: {
    weekIndex: {
      upsert: vi.fn(),
    },
    weekPlan: {
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    shoppingState: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    extraShoppingItem: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    extraItemCatalog: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    shoppingPackage: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  };
});

vi.mock("@repo/database", () => ({
  prisma: prismaMock,
  // planner.ts only uses Prisma.sql/Prisma.join to build raw queries, and the
  // raw query execution itself is mocked, so lightweight stubs are enough.
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

const LOK_ID = "00000000-0000-0000-0000-000000000001";
const KJOTT_ID = "00000000-0000-0000-0000-000000000002";
const SALT_ID = "00000000-0000-0000-0000-000000000003";
const PASTA_ID = "00000000-0000-0000-0000-000000000004";
const CATALOG_ID = "00000000-0000-0000-0000-000000000050";

// Monday in the current planning window relative to vitest's real clock is
// not guaranteed, so use a fixed system time.
const NOW = new Date("2026-07-09T12:00:00.000Z");
const WEEK_START = new Date("2026-07-06T00:00:00.000Z");
const WEEK_ISO = WEEK_START.toISOString();

function makeIngredient(args: {
  ingredientId: string;
  name: string;
  unit?: string | null;
  quantity?: number | null;
  isPantryItem?: boolean;
  category?: string;
}) {
  return {
    ingredientId: args.ingredientId,
    quantity: args.quantity ?? null,
    notes: null,
    ingredient: {
      name: args.name,
      unit: args.unit ?? null,
      isPantryItem: args.isPantryItem ?? false,
      category: args.category ?? "UKATEGORISERT",
    },
  };
}

function makeRecipe(id: string, name: string, ingredients: unknown[]) {
  return {
    id,
    name,
    category: "ANNET",
    everydayScore: 3,
    healthScore: 3,
    lastUsed: null,
    usageCount: 0,
    ingredients,
  };
}

const createCaller = () =>
  plannerRouter.createCaller({ user: USER, householdId: HOUSEHOLD_ID });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  prismaMock.weekIndex.upsert.mockResolvedValue({ id: "week-index-1" });
  prismaMock.weekPlan.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.$queryRaw.mockResolvedValue([]);
});

describe("planner.shoppingList", () => {
  it("aggregates ingredients per day, skips freezer entries and lists planned days", async () => {
    prismaMock.weekPlan.findMany.mockResolvedValueOnce([
      {
        weekStart: WEEK_START,
        entries: [
          {
            dayIndex: 0,
            entryType: "RECIPE",
            recipe: makeRecipe("r1", "Taco", [
              makeIngredient({
                ingredientId: LOK_ID,
                name: "Løk",
                unit: "stk",
                quantity: 1,
                category: "GRONNSAKER",
              }),
              makeIngredient({
                ingredientId: KJOTT_ID,
                name: "Kjøttdeig",
                unit: "g",
                quantity: 400,
                category: "KJOTT",
              }),
            ]),
          },
          {
            dayIndex: 1,
            entryType: "RECIPE",
            recipe: makeRecipe("r2", "Suppe", [
              makeIngredient({
                ingredientId: LOK_ID,
                name: "Løk",
                unit: "stk",
                quantity: 2,
                category: "GRONNSAKER",
              }),
              makeIngredient({
                ingredientId: SALT_ID,
                name: "Salt",
                isPantryItem: true,
              }),
            ]),
          },
          {
            dayIndex: 2,
            entryType: "FREEZER",
            recipe: makeRecipe("r3", "Lasagne", [
              makeIngredient({
                ingredientId: PASTA_ID,
                name: "Pasta",
                unit: "g",
                quantity: 300,
              }),
            ]),
          },
          { dayIndex: 3, entryType: "TAKEAWAY", recipe: null },
        ],
      },
    ]);
    prismaMock.shoppingState.findMany.mockResolvedValueOnce([
      {
        weekStart: WEEK_START,
        ingredientId: LOK_ID,
        unit: "stk",
        checked: true,
        firstCheckedDayIndex: 0,
      },
    ]);
    prismaMock.extraShoppingItem.findMany.mockResolvedValueOnce([]);

    const result = await createCaller().shoppingList({ weekStart: WEEK_ISO });

    expect(result.includedWeekStarts).toEqual([WEEK_ISO]);

    const lok = result.items.find((item) => item.ingredientId === LOK_ID);
    expect(lok).toMatchObject({
      name: "Løk",
      unit: "stk",
      category: "FRUKT_OG_GRONT",
      totalQuantity: 3,
      hasMissingQuantities: false,
      checked: true,
      isPantryItem: false,
    });
    expect(lok?.occurrences).toHaveLength(2);
    expect(lok?.occurrences[0]).toMatchObject({
      weekStart: WEEK_ISO,
      dayIndex: 0,
      quantity: 1,
      checked: true,
      weekdayLabel: "Mandag",
    });
    expect(lok?.occurrences[1]).toMatchObject({ dayIndex: 1, quantity: 2 });
    expect(lok?.firstCheckedOccurrences).toEqual([
      { weekStart: WEEK_ISO, dayIndex: 0 },
    ]);

    const salt = result.items.find((item) => item.ingredientId === SALT_ID);
    expect(salt).toMatchObject({
      isPantryItem: true,
      totalQuantity: null,
      hasMissingQuantities: true,
      checked: false,
    });

    // FREEZER meals are cooked from stock: the day is planned, but its
    // ingredients must not be added to the shopping list.
    expect(
      result.items.find((item) => item.ingredientId === PASTA_ID),
    ).toBeUndefined();
    expect(result.plannedDays.map((day) => day.dayIndex)).toEqual([0, 1, 2, 3]);
    expect(
      result.plannedDays.find((day) => day.entryType === "FREEZER"),
    ).toMatchObject({ recipeName: "Lasagne" });
    expect(
      result.plannedDays.find((day) => day.entryType === "TAKEAWAY"),
    ).toMatchObject({ recipeName: null });
  });

  it("formats day labels in UTC regardless of server timezone", async () => {
    prismaMock.weekPlan.findMany.mockResolvedValueOnce([
      {
        weekStart: WEEK_START,
        entries: [
          {
            dayIndex: 6,
            entryType: "RECIPE",
            recipe: makeRecipe("r1", "Grøt", [
              makeIngredient({
                ingredientId: LOK_ID,
                name: "Havregryn",
                unit: "dl",
                quantity: 2,
              }),
            ]),
          },
        ],
      },
    ]);
    prismaMock.shoppingState.findMany.mockResolvedValueOnce([]);
    prismaMock.extraShoppingItem.findMany.mockResolvedValueOnce([]);

    const result = await createCaller().shoppingList({ weekStart: WEEK_ISO });

    // Week dates are UTC midnights and the formatters pin timeZone: "UTC".
    // Sunday 2026-07-12 must be labelled Sunday; without the pinned timezone
    // this fails whenever the process runs in a timezone behind UTC.
    expect(result.items[0]?.occurrences[0]).toMatchObject({
      weekdayLabel: "Søndag",
      dateISO: "2026-07-12T00:00:00.000Z",
    });
  });

  it("deduplicates extras per catalog item and resolves categories", async () => {
    prismaMock.weekPlan.findMany.mockResolvedValueOnce([]);
    prismaMock.shoppingState.findMany.mockResolvedValueOnce([]);
    prismaMock.extraShoppingItem.findMany.mockResolvedValueOnce([
      {
        id: "extra-newest",
        catalogItemId: CATALOG_ID,
        weekStart: WEEK_START,
        checked: false,
        updatedAt: new Date("2026-07-08T10:00:00.000Z"),
        catalogItem: { name: "Vaskemiddel" },
      },
      {
        id: "extra-older",
        catalogItemId: CATALOG_ID,
        weekStart: new Date("1970-01-05T00:00:00.000Z"),
        checked: true,
        updatedAt: new Date("2026-07-01T10:00:00.000Z"),
        catalogItem: { name: "Vaskemiddel" },
      },
    ]);
    prismaMock.$queryRaw.mockResolvedValueOnce([
      { id: CATALOG_ID, category: "HUSHOLDNING" },
    ]);

    const result = await createCaller().shoppingList({ weekStart: WEEK_ISO });

    expect(result.extras).toEqual([
      {
        id: "extra-newest",
        name: "Vaskemiddel",
        weekStart: WEEK_ISO,
        checked: false,
        updatedAt: "2026-07-08T10:00:00.000Z",
        category: "HUSHOLDNING",
        hasCategory: true,
      },
    ]);
  });
});

describe("planner.updateShoppingItem", () => {
  beforeEach(() => {
    prismaMock.$transaction.mockImplementation(async (ops: unknown[]) =>
      Promise.all(ops as Promise<unknown>[]),
    );
    prismaMock.shoppingState.upsert.mockResolvedValue({});
  });

  it("checks occurrences and records the earliest checked day", async () => {
    const result = await createCaller().updateShoppingItem({
      ingredientId: LOK_ID,
      unit: "stk",
      occurrences: [
        { weekStart: WEEK_ISO, dayIndex: 4 },
        { weekStart: WEEK_ISO, dayIndex: 2 },
      ],
      checked: true,
    });

    expect(result).toEqual({ ok: true });
    expect(prismaMock.shoppingState.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.shoppingState.upsert).toHaveBeenCalledWith({
      where: {
        weekStart_ingredientId_unit_householdId: {
          weekStart: WEEK_START,
          ingredientId: LOK_ID,
          unit: "stk",
          householdId: HOUSEHOLD_ID,
        },
      },
      create: {
        weekStart: WEEK_START,
        ingredientId: LOK_ID,
        unit: "stk",
        checked: true,
        firstCheckedDayIndex: 2,
        householdId: HOUSEHOLD_ID,
      },
      update: { checked: true, firstCheckedDayIndex: 2 },
    });
  });

  it("clears firstCheckedDayIndex when unchecking", async () => {
    await createCaller().updateShoppingItem({
      ingredientId: LOK_ID,
      unit: null,
      weeks: [WEEK_ISO],
      checked: false,
    });

    expect(prismaMock.shoppingState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          unit: "",
          checked: false,
          firstCheckedDayIndex: null,
        }),
        update: { checked: false, firstCheckedDayIndex: null },
      }),
    );
  });

  it("rejects updates without a target week", async () => {
    await expect(
      createCaller().updateShoppingItem({
        ingredientId: LOK_ID,
        unit: "stk",
        checked: true,
      }),
    ).rejects.toThrow(/Mangler uke/);
  });
});

describe("planner extras and package search", () => {
  it("suggests extras case-insensitively", async () => {
    prismaMock.extraItemCatalog.findMany.mockResolvedValueOnce([
      { id: CATALOG_ID, name: "Melk" },
    ]);
    prismaMock.$queryRaw.mockResolvedValueOnce([
      { id: CATALOG_ID, category: null },
    ]);

    const result = await createCaller().extraSuggest({ search: " melk " });

    expect(prismaMock.extraItemCatalog.findMany).toHaveBeenCalledWith({
      where: {
        name: { contains: "melk", mode: "insensitive" },
        householdId: HOUSEHOLD_ID,
      },
      orderBy: { name: "asc" },
      take: 20,
    });
    expect(result).toEqual([
      { id: CATALOG_ID, name: "Melk", category: null, hasCategory: false },
    ]);
  });

  it("returns no extra suggestions for empty search", async () => {
    const result = await createCaller().extraSuggest({ search: "   " });

    expect(result).toEqual([]);
    expect(prismaMock.extraItemCatalog.findMany).not.toHaveBeenCalled();
  });

  it("suggests packages case-insensitively", async () => {
    prismaMock.shoppingPackage.findMany.mockResolvedValueOnce([
      { id: "00000000-0000-0000-0000-000000000060", name: "Taco-pakke", _count: { items: 4 } },
    ]);

    const result = await createCaller().packageSuggest({ search: "taco" });

    expect(prismaMock.shoppingPackage.findMany).toHaveBeenCalledWith({
      where: {
        name: { contains: "taco", mode: "insensitive" },
        householdId: HOUSEHOLD_ID,
      },
      orderBy: { name: "asc" },
      take: 10,
      include: { _count: { select: { items: true } } },
    });
    expect(result).toEqual([
      { id: "00000000-0000-0000-0000-000000000060", name: "Taco-pakke", itemCount: 4 },
    ]);
  });

  it("syncs the checked state across all weeks on toggle", async () => {
    prismaMock.extraItemCatalog.upsert.mockResolvedValueOnce({
      id: CATALOG_ID,
      name: "Melk",
    });
    prismaMock.extraShoppingItem.findFirst.mockResolvedValueOnce({
      id: "extra-1",
      checked: false,
    });

    const tx = {
      extraShoppingItem: {
        upsert: vi.fn().mockResolvedValue({ id: "extra-global", checked: true }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prismaMock.$transaction.mockImplementationOnce(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const result = await createCaller().extraToggle({
      weekStart: WEEK_ISO,
      name: "Melk",
      checked: true,
    });

    expect(tx.extraShoppingItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          weekStart_catalogItemId_householdId: {
            weekStart: new Date("1970-01-05T00:00:00.000Z"),
            catalogItemId: CATALOG_ID,
            householdId: HOUSEHOLD_ID,
          },
        },
      }),
    );
    expect(tx.extraShoppingItem.updateMany).toHaveBeenCalledWith({
      where: {
        catalogItemId: CATALOG_ID,
        householdId: HOUSEHOLD_ID,
        NOT: { id: "extra-global" },
      },
      data: { checked: true },
    });
    expect(result).toEqual({ id: "extra-global", checked: true });
  });
});
