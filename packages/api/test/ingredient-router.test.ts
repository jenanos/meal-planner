import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";

const { ingredientModel } = vi.hoisted(() => {
  return {
    ingredientModel: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
});

vi.mock("@repo/database", () => ({
  prisma: {
    ingredient: ingredientModel,
  },
}));

import { ingredientRouter } from "../src/routers/ingredient";

const createCaller = () => ingredientRouter.createCaller({});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ingredient router", () => {
  it("lists ingredients with trimmed search and usage counts", async () => {
    ingredientModel.findMany.mockResolvedValueOnce([
      {
        id: "ing1",
        name: "Paprika",
        unit: null,
        _count: { recipes: 3 },
      },
    ]);

    const caller = createCaller();
    const result = await caller.list({ search: "  pap  " });

    expect(ingredientModel.findMany).toHaveBeenCalledWith({
      where: { name: { contains: "pap" } },
      orderBy: { name: "asc" },
      include: { _count: { select: { recipes: true } } },
    });

    expect(result).toEqual([
      { id: "ing1", name: "Paprika", unit: undefined, usageCount: 3 },
    ]);
  });

  it("lists all ingredients when search is omitted", async () => {
    ingredientModel.findMany.mockResolvedValueOnce([]);

    const caller = createCaller();
    await caller.list({});

    expect(ingredientModel.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { name: "asc" },
      include: { _count: { select: { recipes: true } } },
    });
  });

  it("trims input and upserts on create", async () => {
    ingredientModel.upsert.mockResolvedValueOnce({
      id: "ing2",
      name: "Timian",
      unit: null,
    });

    const caller = createCaller();
    const result = await caller.create({ name: "  Timian  ", unit: "  ts  " });

    expect(ingredientModel.upsert).toHaveBeenCalledWith({
      where: { name: "Timian" },
      update: { unit: "ts" },
      create: { name: "Timian", unit: "ts" },
    });

    expect(result).toEqual({ id: "ing2", name: "Timian", unit: undefined });
  });

  it("wraps upsert errors in TRPCError", async () => {
    ingredientModel.upsert.mockRejectedValueOnce(new Error("duplicate"));

    const caller = createCaller();
    await expect(caller.create({ name: "Basilikum" })).rejects.toBeInstanceOf(
      TRPCError
    );
  });

  it("returns ingredient with attached recipes", async () => {
    ingredientModel.findUnique.mockResolvedValueOnce({
      id: "ing3",
      name: "Løk",
      unit: null,
      recipes: [
        {
          recipe: {
            id: "rec1",
            name: "Suppe",
            category: "ANNET",
            everydayScore: 2,
            healthScore: 4,
          },
        },
      ],
    });

    const caller = createCaller();
    const result = await caller.getWithRecipes({
      id: "00000000-0000-0000-0000-000000000001",
    });

    expect(result).toEqual({
      id: "ing3",
      name: "Løk",
      unit: undefined,
      recipes: [
        {
          id: "rec1",
          name: "Suppe",
          category: "ANNET",
          everydayScore: 2,
          healthScore: 4,
        },
      ],
    });
  });

  it("throws NOT_FOUND when ingredient is missing", async () => {
    ingredientModel.findUnique.mockResolvedValueOnce(null);

    const caller = createCaller();
    await expect(
      caller.getWithRecipes({
        id: "00000000-0000-0000-0000-000000000002",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lists ingredients without unit", async () => {
    ingredientModel.findMany.mockResolvedValueOnce([
      {
        id: "ing1",
        name: "Løk",
        unit: null,
        isPantryItem: false,
        _count: { recipes: 2 },
      },
      {
        id: "ing2",
        name: "Mel",
        unit: null,
        isPantryItem: true,
        _count: { recipes: 5 },
      },
    ]);

    const caller = createCaller();
    const result = await caller.listWithoutUnit();

    expect(ingredientModel.findMany).toHaveBeenCalledWith({
      where: { unit: null },
      orderBy: { name: "asc" },
      include: { _count: { select: { recipes: true } } },
    });

    expect(result).toEqual([
      { id: "ing1", name: "Løk", unit: undefined, usageCount: 2, isPantryItem: false },
      { id: "ing2", name: "Mel", unit: undefined, usageCount: 5, isPantryItem: true },
    ]);
  });

  it("finds potential duplicate ingredients", async () => {
    ingredientModel.findMany.mockResolvedValueOnce([
      {
        id: "ing1",
        name: "Løk",
        unit: "stk",
        isPantryItem: false,
        _count: { recipes: 2 },
      },
      {
        id: "ing2",
        name: "Løk, rød",
        unit: "stk",
        isPantryItem: false,
        _count: { recipes: 3 },
      },
      {
        id: "ing3",
        name: "Mel",
        unit: "g",
        isPantryItem: true,
        _count: { recipes: 5 },
      },
    ]);

    const caller = createCaller();
    const result = await caller.listPotentialDuplicates();

    expect(ingredientModel.findMany).toHaveBeenCalledWith({
      orderBy: { name: "asc" },
      include: { _count: { select: { recipes: true } } },
    });

    expect(result.length).toBeGreaterThan(0);
    // Should have at least one group with "Løk" variants
    const hasLokGroup = result.some((group) =>
      group.some((ing) => ing.name.includes("Løk"))
    );
    expect(hasLokGroup).toBe(true);
  });

  it("skips ingredients that normalize to empty in duplicate grouping", async () => {
    ingredientModel.findMany.mockResolvedValueOnce([
      {
        id: "ing1",
        name: "!!!",
        unit: "stk",
        isPantryItem: false,
        _count: { recipes: 0 },
      },
      {
        id: "ing2",
        name: "  ",
        unit: "g",
        isPantryItem: false,
        _count: { recipes: 1 },
      },
      {
        id: "ing3",
        name: "Løk",
        unit: "stk",
        isPantryItem: false,
        _count: { recipes: 2 },
      },
      {
        id: "ing4",
        name: "Løk, rød",
        unit: "stk",
        isPantryItem: false,
        _count: { recipes: 3 },
      },
    ]);

    const caller = createCaller();
    const result = await caller.listPotentialDuplicates();

    expect(result.length).toBe(1);
    const onlyGroup = result[0];
    expect(onlyGroup).toEqual([
      { id: "ing3", name: "Løk", unit: "stk", usageCount: 2, isPantryItem: false },
      { id: "ing4", name: "Løk, rød", unit: "stk", usageCount: 3, isPantryItem: false },
    ]);
  });

  it("bulk updates ingredient units", async () => {
    ingredientModel.update
      .mockResolvedValueOnce({ id: "ing1", name: "Løk", unit: "stk", isPantryItem: false })
      .mockResolvedValueOnce({ id: "ing2", name: "Mel", unit: "g", isPantryItem: true });

    const caller = createCaller();
    const result = await caller.bulkUpdateUnits({
      updates: [
        { id: "ing1", unit: "stk" },
        { id: "ing2", unit: "g" },
      ],
    });

    expect(ingredientModel.update).toHaveBeenCalledTimes(2);
    expect(ingredientModel.update).toHaveBeenCalledWith({
      where: { id: "ing1" },
      data: { unit: "stk" },
    });
    expect(ingredientModel.update).toHaveBeenCalledWith({
      where: { id: "ing2" },
      data: { unit: "g" },
    });

    expect(result).toEqual({ count: 2 });
  });

  it("trims units during bulk updates", async () => {
    ingredientModel.update
      .mockResolvedValueOnce({ id: "ing1", name: "Løk", unit: "stk", isPantryItem: false })
      .mockResolvedValueOnce({ id: "ing2", name: "Mel", unit: "g", isPantryItem: true });

    const caller = createCaller();
    await caller.bulkUpdateUnits({
      updates: [
        { id: "ing1", unit: " stk " },
        { id: "ing2", unit: " g " },
      ],
    });

    expect(ingredientModel.update).toHaveBeenCalledWith({
      where: { id: "ing1" },
      data: { unit: "stk" },
    });
    expect(ingredientModel.update).toHaveBeenCalledWith({
      where: { id: "ing2" },
      data: { unit: "g" },
    });
  });

  it("rejects whitespace-only units during bulk updates", async () => {
    const caller = createCaller();

    await expect(
      caller.bulkUpdateUnits({
        updates: [{ id: "ing1", unit: "   " }],
      })
    ).rejects.toBeInstanceOf(Error);
  });

  it("bulk updates handles failures gracefully", async () => {
    ingredientModel.update
      .mockResolvedValueOnce({ id: "ing1", name: "Løk", unit: "stk", isPantryItem: false })
      .mockRejectedValueOnce(new Error("Not found"));

    const caller = createCaller();
    const result = await caller.bulkUpdateUnits({
      updates: [
        { id: "ing1", unit: "stk" },
        { id: "invalid-id", unit: "g" },
      ],
    });

    // Should still return count of 1 (only the successful update)
    expect(result.count).toBe(1);
  });
});
