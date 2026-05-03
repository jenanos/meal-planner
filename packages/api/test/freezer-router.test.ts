import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    freezerItem: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    recipe: {
      findUniqueOrThrow: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@repo/database", () => ({
  prisma: prismaMock,
}));

import { freezerRouter } from "../src/routers/freezer";

const HOUSEHOLD_ID = "00000000-0000-0000-0000-000000000100";
const USER = {
  id: "00000000-0000-0000-0000-000000000101",
  email: "user@example.com",
  name: "Test User",
  role: "USER" as const,
};

const createCaller = (
  ctx: Partial<{ user: typeof USER | null; householdId: string | null }> = {}
) =>
  freezerRouter.createCaller({
    user: USER,
    householdId: HOUSEHOLD_ID,
    ...ctx,
  });

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("freezer router", () => {
  it("lists household freezer items", async () => {
    prismaMock.freezerItem.findMany.mockResolvedValueOnce([
      {
        id: "00000000-0000-0000-0000-000000000001",
        recipeId: "00000000-0000-0000-0000-000000000201",
        quantity: 2,
        frozenAt: new Date("2024-01-01T00:00:00.000Z"),
        expiresAt: new Date("2024-03-01T00:00:00.000Z"),
        recipe: {
          id: "00000000-0000-0000-0000-000000000201",
          name: "Fiskegrateng",
          category: "FISK",
        },
      },
    ]);

    const result = await createCaller().list();

    expect(prismaMock.freezerItem.findMany).toHaveBeenCalledWith({
      where: { householdId: HOUSEHOLD_ID },
      include: { recipe: { select: { id: true, name: true, category: true } } },
      orderBy: { recipe: { name: "asc" } },
    });
    expect(result).toEqual([
      {
        id: "00000000-0000-0000-0000-000000000001",
        recipeId: "00000000-0000-0000-0000-000000000201",
        recipeName: "Fiskegrateng",
        recipeCategory: "FISK",
        quantity: 2,
        frozenAt: "2024-01-01T00:00:00.000Z",
        expiresAt: "2024-03-01T00:00:00.000Z",
      },
    ]);
  });

  it("removes items when upsert quantity is zero", async () => {
    prismaMock.freezerItem.deleteMany.mockResolvedValueOnce({ count: 1 });

    const result = await createCaller().upsert({
      recipeId: "00000000-0000-0000-0000-000000000202",
      quantity: 0,
    });

    expect(prismaMock.freezerItem.deleteMany).toHaveBeenCalledWith({
      where: {
        recipeId: "00000000-0000-0000-0000-000000000202",
        householdId: HOUSEHOLD_ID,
      },
    });
    expect(result).toBeNull();
  });

  it("upserts items with computed expiry dates", async () => {
    const frozenAt = new Date("2024-01-15T00:00:00.000Z");
    const expectedExpiresAt = new Date(frozenAt);
    expectedExpiresAt.setMonth(expectedExpiresAt.getMonth() + 4);

    prismaMock.recipe.findUniqueOrThrow.mockResolvedValueOnce({
      id: "00000000-0000-0000-0000-000000000203",
      name: "Kyllinggryte",
      category: "KYLLING",
    });
    prismaMock.freezerItem.upsert.mockResolvedValueOnce({
      id: "00000000-0000-0000-0000-000000000002",
      recipeId: "00000000-0000-0000-0000-000000000203",
      quantity: 3,
      frozenAt,
      expiresAt: expectedExpiresAt,
      recipe: {
        id: "00000000-0000-0000-0000-000000000203",
        name: "Kyllinggryte",
        category: "KYLLING",
      },
    });

    const result = await createCaller().upsert({
      recipeId: "00000000-0000-0000-0000-000000000203",
      quantity: 3,
      frozenAt: "2024-01-15T00:00:00.000Z",
    });

    expect(prismaMock.recipe.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "00000000-0000-0000-0000-000000000203" },
      select: { id: true, name: true, category: true },
    });
    expect(prismaMock.freezerItem.upsert).toHaveBeenCalledWith({
      where: {
        recipeId_householdId: {
          recipeId: "00000000-0000-0000-0000-000000000203",
          householdId: HOUSEHOLD_ID,
        },
      },
      update: {
        quantity: 3,
        frozenAt,
      },
      create: {
        recipeId: "00000000-0000-0000-0000-000000000203",
        householdId: HOUSEHOLD_ID,
        quantity: 3,
        frozenAt,
        expiresAt: expectedExpiresAt,
      },
      include: { recipe: { select: { id: true, name: true, category: true } } },
    });
    expect(result).toEqual({
      id: "00000000-0000-0000-0000-000000000002",
      recipeId: "00000000-0000-0000-0000-000000000203",
      recipeName: "Kyllinggryte",
      recipeCategory: "KYLLING",
      quantity: 3,
      frozenAt: "2024-01-15T00:00:00.000Z",
      expiresAt: expectedExpiresAt.toISOString(),
    });
  });

  it("updates freezer dates", async () => {
    prismaMock.freezerItem.update.mockResolvedValueOnce({
      id: "00000000-0000-0000-0000-000000000003",
      recipeId: "00000000-0000-0000-0000-000000000204",
      quantity: 1,
      frozenAt: new Date("2024-02-01T00:00:00.000Z"),
      expiresAt: new Date("2024-06-01T00:00:00.000Z"),
      recipe: {
        id: "00000000-0000-0000-0000-000000000204",
        name: "Lasagne",
        category: "ANNET",
      },
    });

    const result = await createCaller().updateDates({
      recipeId: "00000000-0000-0000-0000-000000000204",
      frozenAt: "2024-02-01T00:00:00.000Z",
      expiresAt: "2024-06-01T00:00:00.000Z",
    });

    expect(prismaMock.freezerItem.update).toHaveBeenCalledWith({
      where: {
        recipeId_householdId: {
          recipeId: "00000000-0000-0000-0000-000000000204",
          householdId: HOUSEHOLD_ID,
        },
      },
      data: {
        frozenAt: new Date("2024-02-01T00:00:00.000Z"),
        expiresAt: new Date("2024-06-01T00:00:00.000Z"),
      },
      include: { recipe: { select: { id: true, name: true, category: true } } },
    });
    expect(result.expiresAt).toBe("2024-06-01T00:00:00.000Z");
  });

  it("removes freezer items explicitly", async () => {
    prismaMock.freezerItem.deleteMany.mockResolvedValueOnce({ count: 1 });

    const result = await createCaller().remove({
      recipeId: "00000000-0000-0000-0000-000000000205",
    });

    expect(prismaMock.freezerItem.deleteMany).toHaveBeenCalledWith({
      where: {
        recipeId: "00000000-0000-0000-0000-000000000205",
        householdId: HOUSEHOLD_ID,
      },
    });
    expect(result).toEqual({ success: true });
  });

  it("decrements by deleting single-quantity items", async () => {
    const tx = {
      freezerItem: {
        deleteMany: vi.fn().mockResolvedValueOnce({ count: 1 }),
        updateMany: vi.fn(),
        findFirst: vi.fn(),
      },
    };
    prismaMock.$transaction.mockImplementationOnce(async (callback) => callback(tx));

    const result = await createCaller().decrement({
      recipeId: "00000000-0000-0000-0000-000000000206",
    });

    expect(tx.freezerItem.deleteMany).toHaveBeenCalledWith({
      where: {
        recipeId: "00000000-0000-0000-0000-000000000206",
        householdId: HOUSEHOLD_ID,
        quantity: 1,
      },
    });
    expect(tx.freezerItem.updateMany).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("decrements multi-quantity items and returns the updated row", async () => {
    const tx = {
      freezerItem: {
        deleteMany: vi.fn().mockResolvedValueOnce({ count: 0 }),
        updateMany: vi.fn().mockResolvedValueOnce({ count: 1 }),
        findFirst: vi.fn().mockResolvedValueOnce({
          id: "00000000-0000-0000-0000-000000000004",
          recipeId: "00000000-0000-0000-0000-000000000207",
          quantity: 2,
        }),
      },
    };
    prismaMock.$transaction.mockImplementationOnce(async (callback) => callback(tx));

    const result = await createCaller().decrement({
      recipeId: "00000000-0000-0000-0000-000000000207",
    });

    expect(tx.freezerItem.updateMany).toHaveBeenCalledWith({
      where: {
        recipeId: "00000000-0000-0000-0000-000000000207",
        householdId: HOUSEHOLD_ID,
        quantity: { gt: 1 },
      },
      data: { quantity: { decrement: 1 } },
    });
    expect(result).toEqual({
      id: "00000000-0000-0000-0000-000000000004",
      recipeId: "00000000-0000-0000-0000-000000000207",
      quantity: 2,
    });
  });

  it("returns null when decrement finds nothing to update", async () => {
    const tx = {
      freezerItem: {
        deleteMany: vi.fn().mockResolvedValueOnce({ count: 0 }),
        updateMany: vi.fn().mockResolvedValueOnce({ count: 0 }),
        findFirst: vi.fn(),
      },
    };
    prismaMock.$transaction.mockImplementationOnce(async (callback) => callback(tx));

    const result = await createCaller().decrement({
      recipeId: "00000000-0000-0000-0000-000000000208",
    });

    expect(result).toBeNull();
    expect(tx.freezerItem.findFirst).not.toHaveBeenCalled();
  });

  it("increments freezer items and computes default expiry", async () => {
    vi.useFakeTimers();
    const frozenAt = new Date("2024-03-10T00:00:00.000Z");
    const expectedExpiresAt = new Date(frozenAt);
    expectedExpiresAt.setMonth(expectedExpiresAt.getMonth() + 2);
    vi.setSystemTime(frozenAt);

    prismaMock.recipe.findUniqueOrThrow.mockResolvedValueOnce({
      id: "00000000-0000-0000-0000-000000000209",
      name: "Torsk",
      category: "FISK",
    });
    prismaMock.freezerItem.upsert.mockResolvedValueOnce({
      id: "00000000-0000-0000-0000-000000000005",
      recipeId: "00000000-0000-0000-0000-000000000209",
      quantity: 4,
    });

    const result = await createCaller().increment({
      recipeId: "00000000-0000-0000-0000-000000000209",
    });

    expect(prismaMock.freezerItem.upsert).toHaveBeenCalledWith({
      where: {
        recipeId_householdId: {
          recipeId: "00000000-0000-0000-0000-000000000209",
          householdId: HOUSEHOLD_ID,
        },
      },
      update: { quantity: { increment: 1 } },
      create: {
        recipeId: "00000000-0000-0000-0000-000000000209",
        householdId: HOUSEHOLD_ID,
        quantity: 1,
        frozenAt,
        expiresAt: expectedExpiresAt,
      },
    });
    expect(result).toEqual({
      id: "00000000-0000-0000-0000-000000000005",
      recipeId: "00000000-0000-0000-0000-000000000209",
      quantity: 4,
    });
  });

  it("requires authentication and household membership", async () => {
    await expect(
      createCaller({ user: null, householdId: null }).list()
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
