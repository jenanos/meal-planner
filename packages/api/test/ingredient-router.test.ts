import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";

const { ingredientModel } = vi.hoisted(() => {
  return {
    ingredientModel: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      findUnique: vi.fn(),
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
});
