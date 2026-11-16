import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    household: {
      findUnique: vi.fn(),
    },
    shoppingState: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    extraShoppingItem: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
    },
    extraItemCatalog: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    shoppingDeal: {
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    shoppingPackage: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
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

function makeRecipe(
  id: string,
  name: string,
  ingredients: unknown[],
  servings: number | null = null,
) {
  return {
    id,
    name,
    servings,
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
  prismaMock.household.findUnique.mockResolvedValue({ servings: null });
});

afterEach(() => {
  vi.useRealTimers();
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
        checkedDayIndices: [0],
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
      // Only Monday is checked, so the item as a whole is not done.
      checked: false,
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
    expect(lok?.occurrences[1]).toMatchObject({
      dayIndex: 1,
      quantity: 2,
      checked: false,
    });
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

  describe("portions", () => {
    function planWith(servingsByRecipe: [number | null, number | null]) {
      prismaMock.weekPlan.findMany.mockResolvedValueOnce([
        {
          weekStart: WEEK_START,
          entries: [
            {
              dayIndex: 0,
              entryType: "RECIPE",
              recipe: makeRecipe(
                "r1",
                "Gryte",
                [
                  makeIngredient({
                    ingredientId: KJOTT_ID,
                    name: "Kjøtt",
                    unit: "g",
                    quantity: 400,
                  }),
                ],
                servingsByRecipe[0],
              ),
            },
            {
              dayIndex: 1,
              entryType: "RECIPE",
              recipe: makeRecipe(
                "r2",
                "Biff",
                [
                  makeIngredient({
                    ingredientId: KJOTT_ID,
                    name: "Kjøtt",
                    unit: "g",
                    quantity: 300,
                  }),
                ],
                servingsByRecipe[1],
              ),
            },
          ],
        },
      ]);
      prismaMock.shoppingState.findMany.mockResolvedValueOnce([]);
      prismaMock.extraShoppingItem.findMany.mockResolvedValueOnce([]);
    }

    it("scales recipes that state their portions to the household's", async () => {
      prismaMock.household.findUnique.mockResolvedValue({ servings: 2 });
      // Gryte is written for 4 and gets halved; Biff says nothing and is
      // used as written.
      planWith([4, null]);

      const result = await createCaller().shoppingList({ weekStart: WEEK_ISO });
      const kjott = result.items.find((item) => item.ingredientId === KJOTT_ID);

      expect(result.householdServings).toBe(2);
      expect(kjott?.occurrences.map((o) => o.quantity)).toEqual([200, 300]);
      expect(kjott?.totalQuantity).toBe(500);
      expect(kjott?.details.map((d) => d.quantity)).toEqual([200, 300]);
    });

    it("rounds scaled quantities to two decimals", async () => {
      prismaMock.household.findUnique.mockResolvedValue({ servings: 2 });
      planWith([3, 3]);

      const result = await createCaller().shoppingList({ weekStart: WEEK_ISO });
      const kjott = result.items.find((item) => item.ingredientId === KJOTT_ID);

      expect(kjott?.occurrences.map((o) => o.quantity)).toEqual([266.67, 200]);
    });

    it("leaves quantities as written when the household has no portions", async () => {
      planWith([4, 2]);

      const result = await createCaller().shoppingList({ weekStart: WEEK_ISO });
      const kjott = result.items.find((item) => item.ingredientId === KJOTT_ID);

      expect(result.householdServings).toBeNull();
      expect(kjott?.totalQuantity).toBe(700);
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
        deal: null,
      },
    ]);
  });

  it("reports the store offer on an extra and purges expired offers first", async () => {
    prismaMock.weekPlan.findMany.mockResolvedValueOnce([]);
    prismaMock.shoppingState.findMany.mockResolvedValueOnce([]);
    prismaMock.shoppingDeal.count.mockResolvedValueOnce(2);
    prismaMock.extraShoppingItem.deleteMany.mockReturnValue("delete-items");
    prismaMock.shoppingDeal.deleteMany.mockReturnValue("delete-deals");
    prismaMock.extraShoppingItem.findMany.mockResolvedValueOnce([
      {
        id: "extra-kaffe",
        catalogItemId: CATALOG_ID,
        weekStart: new Date("1970-01-05T00:00:00.000Z"),
        checked: false,
        updatedAt: new Date("2026-07-08T10:00:00.000Z"),
        catalogItem: {
          name: "Kaffe",
          deal: {
            store: "Kiwi",
            price: "39,90 kr",
            regularPrice: null,
            product: "Evergood 250 g",
            validFrom: new Date("2026-07-06T00:00:00.000Z"),
            validTo: new Date("2026-07-12T00:00:00.000Z"),
            addedByDeal: true,
          },
        },
      },
    ]);

    const result = await createCaller().shoppingList({ weekStart: WEEK_ISO });

    // Expired = last day before today (9 July in Oslo).
    const expired = {
      householdId: HOUSEHOLD_ID,
      validTo: { lt: new Date("2026-07-09T00:00:00.000Z") },
    };
    expect(prismaMock.shoppingDeal.count).toHaveBeenCalledWith({
      where: expired,
    });
    // Only an item the offer itself put on the list goes with it, and only
    // while it is still unchecked. Each delete re-checks expiry itself.
    expect(prismaMock.extraShoppingItem.deleteMany).toHaveBeenCalledWith({
      where: {
        householdId: HOUSEHOLD_ID,
        checked: false,
        catalogItem: { deal: { is: { ...expired, addedByDeal: true } } },
      },
    });
    expect(prismaMock.shoppingDeal.deleteMany).toHaveBeenCalledWith({
      where: expired,
    });
    expect(prismaMock.$transaction).toHaveBeenCalledWith([
      "delete-items",
      "delete-deals",
    ]);
    expect(result.extras[0]?.deal).toEqual({
      store: "Kiwi",
      price: "39,90 kr",
      regularPrice: null,
      product: "Evergood 250 g",
      validFrom: "2026-07-06",
      validTo: "2026-07-12",
      addedByDeal: true,
    });
  });
});

describe("planner.updateShoppingItem", () => {
  const where = (unit: string) => ({
    weekStart_ingredientId_unit_householdId: {
      weekStart: WEEK_START,
      ingredientId: LOK_ID,
      unit,
      householdId: HOUSEHOLD_ID,
    },
  });

  beforeEach(() => {
    prismaMock.$transaction.mockImplementation(
      async (run: (tx: typeof prismaMock) => Promise<unknown>) =>
        run(prismaMock),
    );
    prismaMock.shoppingState.findUnique.mockResolvedValue(null);
    prismaMock.shoppingState.upsert.mockResolvedValue({});
  });

  it("checks only the named days", async () => {
    const result = await createCaller().updateShoppingItem({
      ingredientId: LOK_ID,
      unit: "stk",
      occurrences: [
        { weekStart: WEEK_ISO, dayIndex: 4 },
        { weekStart: WEEK_ISO, dayIndex: 2 },
      ],
      checked: true,
    });

    const state = {
      checked: true,
      firstCheckedDayIndex: 2,
      checkedDayIndices: [2, 4],
    };
    expect(result).toEqual({ ok: true });
    expect(prismaMock.shoppingState.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.shoppingState.upsert).toHaveBeenCalledWith({
      where: where("stk"),
      create: {
        weekStart: WEEK_START,
        ingredientId: LOK_ID,
        unit: "stk",
        householdId: HOUSEHOLD_ID,
        ...state,
      },
      update: state,
    });
  });

  it("takes a lock on the item before reading its checked days", async () => {
    const order: string[] = [];
    prismaMock.$executeRaw.mockImplementation(async () => {
      order.push("lock");
    });
    prismaMock.shoppingState.findUnique.mockImplementation(async () => {
      order.push("read");
      return null;
    });

    await createCaller().updateShoppingItem({
      ingredientId: LOK_ID,
      unit: "stk",
      occurrences: [{ weekStart: WEEK_ISO, dayIndex: 1 }],
      checked: true,
    });

    expect(order).toEqual(["lock", "read"]);
    const lockKey = prismaMock.$executeRaw.mock.calls[0]?.[0]?.values?.[0];
    expect(lockKey).toBe(
      `shopping-state:${HOUSEHOLD_ID}:${WEEK_ISO}:${LOK_ID}:stk`,
    );
  });

  it("adds to days that are already checked", async () => {
    prismaMock.shoppingState.findUnique.mockResolvedValue({
      checkedDayIndices: [0, 1],
    });

    await createCaller().updateShoppingItem({
      ingredientId: LOK_ID,
      unit: "stk",
      occurrences: [{ weekStart: WEEK_ISO, dayIndex: 5 }],
      checked: true,
    });

    expect(prismaMock.shoppingState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          checked: true,
          firstCheckedDayIndex: 0,
          checkedDayIndices: [0, 1, 5],
        },
      }),
    );
  });

  it("unchecks one day and leaves the others", async () => {
    prismaMock.shoppingState.findUnique.mockResolvedValue({
      checkedDayIndices: [0, 1, 5],
    });

    await createCaller().updateShoppingItem({
      ingredientId: LOK_ID,
      unit: "stk",
      occurrences: [{ weekStart: WEEK_ISO, dayIndex: 0 }],
      checked: false,
    });

    expect(prismaMock.shoppingState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          checked: true,
          firstCheckedDayIndex: 1,
          checkedDayIndices: [1, 5],
        },
      }),
    );
  });

  it("checks every day when only a week is given", async () => {
    await createCaller().updateShoppingItem({
      ingredientId: LOK_ID,
      unit: "stk",
      weeks: [WEEK_ISO],
      checked: true,
    });

    expect(prismaMock.shoppingState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          checked: true,
          firstCheckedDayIndex: 0,
          checkedDayIndices: [0, 1, 2, 3, 4, 5, 6],
        },
      }),
    );
  });

  it("clears every day when unchecking a week", async () => {
    prismaMock.shoppingState.findUnique.mockResolvedValue({
      checkedDayIndices: [0, 3],
    });

    await createCaller().updateShoppingItem({
      ingredientId: LOK_ID,
      unit: null,
      weeks: [WEEK_ISO],
      checked: false,
    });

    const state = {
      checked: false,
      firstCheckedDayIndex: null,
      checkedDayIndices: [],
    };
    expect(prismaMock.shoppingState.upsert).toHaveBeenCalledWith({
      where: where(""),
      create: expect.objectContaining({ unit: "", ...state }),
      update: state,
    });
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
