import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    shoppingDeal: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    extraShoppingItem: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    extraItemCatalog: {
      upsert: vi.fn(),
    },
    dealWatchItem: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@repo/database", () => ({
  prisma: prismaMock,
}));

import { dealRouter, dealToday } from "../src/routers/deal";

const HOUSEHOLD_ID = "00000000-0000-0000-0000-000000000100";
const CATALOG_ID = "00000000-0000-0000-0000-000000000050";
const USER = {
  id: "00000000-0000-0000-0000-000000000101",
  email: "user@example.com",
  name: "Test User",
  role: "USER" as const,
};

const createCaller = () =>
  dealRouter.createCaller({ user: USER, householdId: HOUSEHOLD_ID });

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

const KIWI_COFFEE = {
  name: "Kaffe",
  store: "Kiwi",
  price: "39,90 kr",
  validTo: "2026-11-22",
};

function storedDeal(overrides: Record<string, unknown> = {}) {
  return {
    id: "deal-1",
    catalogItemId: CATALOG_ID,
    store: "Kiwi",
    price: "39,90 kr",
    regularPrice: null,
    product: null,
    validFrom: null,
    validTo: day("2026-11-22"),
    addedByDeal: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // Monday 16 November 2026, midday in Oslo.
  vi.setSystemTime(new Date("2026-11-16T11:00:00.000Z"));
  prismaMock.shoppingDeal.findMany.mockResolvedValue([]);
  prismaMock.shoppingDeal.findUnique.mockResolvedValue(null);
  prismaMock.dealWatchItem.findUnique.mockResolvedValue(null);
  prismaMock.extraShoppingItem.findMany.mockResolvedValue([]);
  prismaMock.extraItemCatalog.upsert.mockResolvedValue({
    id: CATALOG_ID,
    name: "Kaffe",
  });
  prismaMock.$transaction.mockImplementation(
    async (run: (tx: typeof prismaMock) => Promise<unknown>) =>
      run(prismaMock),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("dealToday", () => {
  it("uses the calendar date in Oslo, not UTC", () => {
    // 23:30 UTC on the 16th is already the 17th in Oslo.
    expect(dealToday(new Date("2026-11-16T23:30:00.000Z"))).toEqual(
      day("2026-11-17"),
    );
  });
});

describe("deal.set", () => {
  it("adds an item that is not on the list and marks it as added by the offer", async () => {
    const result = await createCaller().set({
      deals: [
        {
          ...KIWI_COFFEE,
          regularPrice: "64,90 kr",
          product: "Evergood 250 g",
          validFrom: "2026-11-16",
        },
      ],
    });

    expect(prismaMock.extraShoppingItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          catalogItemId: CATALOG_ID,
          checked: false,
          householdId: HOUSEHOLD_ID,
        }),
      }),
    );
    expect(prismaMock.shoppingDeal.upsert).toHaveBeenCalledWith({
      where: { catalogItemId: CATALOG_ID },
      create: {
        catalogItemId: CATALOG_ID,
        householdId: HOUSEHOLD_ID,
        store: "Kiwi",
        price: "39,90 kr",
        regularPrice: "64,90 kr",
        product: "Evergood 250 g",
        validFrom: day("2026-11-16"),
        validTo: day("2026-11-22"),
        addedByDeal: true,
      },
      update: expect.objectContaining({ addedByDeal: true }),
    });
    expect(result).toEqual({
      saved: [{ name: "Kaffe", status: "added" }],
      skipped: [],
    });
  });

  it("creates a new item with the watchlist's spelling", async () => {
    prismaMock.dealWatchItem.findUnique.mockResolvedValueOnce({ name: "Kaffe" });

    await createCaller().set({ deals: [{ ...KIWI_COFFEE, name: " kaffe " }] });

    expect(prismaMock.extraItemCatalog.upsert).toHaveBeenCalledWith({
      where: { name_householdId: { name: "kaffe", householdId: HOUSEHOLD_ID } },
      update: {},
      create: { name: "Kaffe", householdId: HOUSEHOLD_ID },
    });
  });

  it("attaches the offer to an item that was on the list anyway, without owning it", async () => {
    prismaMock.extraShoppingItem.findMany.mockResolvedValueOnce([
      { id: "row", checked: false },
    ]);

    const result = await createCaller().set({ deals: [KIWI_COFFEE] });

    expect(prismaMock.extraShoppingItem.upsert).not.toHaveBeenCalled();
    expect(prismaMock.shoppingDeal.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ addedByDeal: false }),
      }),
    );
    expect(result.saved).toEqual([{ name: "Kaffe", status: "attached" }]);
  });

  it("does not put a bought item back when the same offer is reported again", async () => {
    prismaMock.shoppingDeal.findUnique.mockResolvedValueOnce(storedDeal());
    prismaMock.extraShoppingItem.findMany.mockResolvedValueOnce([
      { id: "row", checked: true },
    ]);

    const result = await createCaller().set({
      deals: [{ ...KIWI_COFFEE, store: "kiwi" }],
    });

    expect(prismaMock.extraShoppingItem.upsert).not.toHaveBeenCalled();
    expect(prismaMock.extraShoppingItem.updateMany).not.toHaveBeenCalled();
    expect(result.saved).toEqual([{ name: "Kaffe", status: "alreadyBought" }]);
  });

  it("puts a bought item back on the list for a new offer", async () => {
    prismaMock.shoppingDeal.findUnique.mockResolvedValueOnce(
      storedDeal({ validTo: day("2026-11-17") }),
    );
    prismaMock.extraShoppingItem.findMany.mockResolvedValueOnce([
      { id: "row", checked: true },
    ]);

    const result = await createCaller().set({ deals: [KIWI_COFFEE] });

    expect(prismaMock.extraShoppingItem.updateMany).toHaveBeenCalledWith({
      where: { catalogItemId: CATALOG_ID, householdId: HOUSEHOLD_ID },
      data: { checked: false },
    });
    expect(result.saved).toEqual([{ name: "Kaffe", status: "added" }]);
  });

  it("skips offers that are already over, and accepts one ending today", async () => {
    const result = await createCaller().set({
      deals: [
        { ...KIWI_COFFEE, name: "Gulost", validTo: "2026-11-15" },
        { ...KIWI_COFFEE, validTo: "2026-11-16" },
      ],
    });

    expect(prismaMock.extraItemCatalog.upsert).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      saved: [{ name: "Kaffe", status: "added" }],
      skipped: [{ name: "Gulost", reason: "expired" }],
    });
  });

  it("rejects malformed dates and a period that ends before it starts", async () => {
    await expect(
      createCaller().set({ deals: [{ ...KIWI_COFFEE, validTo: "22.11.2026" }] }),
    ).rejects.toThrow();
    await expect(
      createCaller().set({
        deals: [{ ...KIWI_COFFEE, validFrom: "2026-11-23" }],
      }),
    ).rejects.toThrow();
    expect(prismaMock.shoppingDeal.upsert).not.toHaveBeenCalled();
  });
});

describe("deal.remove", () => {
  it("removes the item with the offer only when the offer put it there", async () => {
    prismaMock.shoppingDeal.findFirst
      .mockResolvedValueOnce({
        ...storedDeal({ addedByDeal: true }),
        catalogItem: { name: "Kaffe" },
      })
      .mockResolvedValueOnce({
        ...storedDeal({ id: "deal-2", addedByDeal: false }),
        catalogItem: { name: "Gulost" },
      })
      .mockResolvedValueOnce(null);
    prismaMock.extraShoppingItem.deleteMany.mockResolvedValue({ count: 1 });

    const result = await createCaller().remove({
      names: ["kaffe", "Gulost", "Smør"],
    });

    expect(prismaMock.shoppingDeal.delete).toHaveBeenCalledTimes(2);
    expect(prismaMock.extraShoppingItem.deleteMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      removed: [
        { name: "Kaffe", itemRemoved: true },
        { name: "Gulost", itemRemoved: false },
      ],
      notFound: ["Smør"],
    });
  });
});

describe("deal watchlist", () => {
  it("keeps the stored note when none is given, and clears it on null", async () => {
    prismaMock.dealWatchItem.upsert.mockImplementation(async (args: any) => ({
      name: args.create.name,
      note: args.update.note ?? "lagret notat",
    }));

    await createCaller().watchSet({
      items: [
        { name: " Kaffe " },
        { name: "Gulost", note: null },
        { name: "Smør", note: " under 40 kr " },
      ],
    });

    const updates = prismaMock.dealWatchItem.upsert.mock.calls.map(
      ([args]: any[]) => [args.create.name, args.update],
    );
    expect(updates).toEqual([
      ["Kaffe", {}],
      ["Gulost", { note: null }],
      ["Smør", { note: "under 40 kr" }],
    ]);
  });

  it("reports which names were not on the watchlist", async () => {
    prismaMock.dealWatchItem.deleteMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const result = await createCaller().watchRemove({
      names: ["Kaffe", "Smør"],
    });

    expect(result).toEqual({ removed: ["Kaffe"], notFound: ["Smør"] });
  });
});
