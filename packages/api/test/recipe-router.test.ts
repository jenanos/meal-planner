import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";

const { recipeModel, DecimalStub } = vi.hoisted(() => {
  class DecimalMock {
    value: string;
    constructor(input: unknown) {
      this.value = typeof input === "string" ? input.trim() : String(input);
    }
    toString() {
      return this.value;
    }
  }

  return {
    DecimalStub: DecimalMock,
    recipeModel: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
});

vi.mock("@repo/database", () => ({
  prisma: {
    recipe: recipeModel,
  },
  Prisma: { Decimal: DecimalStub },
}));

import { recipeRouter } from "../src/routers/recipe";
import { Prisma } from "@repo/database";

const createCaller = () => recipeRouter.createCaller({});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recipe router", () => {
  it("lists recipes with pagination and filters", async () => {
    recipeModel.count.mockResolvedValueOnce(5);
    recipeModel.findMany.mockResolvedValueOnce([
      {
        id: "rec1",
        name: "Laksesuppe",
        description: null,
        category: "FISK",
        everydayScore: 4,
        healthScore: 3,
        lastUsed: null,
        usageCount: 2,
        ingredients: [
          {
            ingredientId: "ing1",
            quantity: "1",
            notes: null,
            ingredient: { name: "Laks", unit: "stk" },
          },
        ],
      },
    ]);

    const caller = createCaller();
    const result = await caller.list({
      page: 2,
      pageSize: 2,
      category: "FISK",
      search: "  suppe ",
    });

    expect(recipeModel.count).toHaveBeenCalledWith({
      where: {
        category: "FISK",
        name: { contains: "suppe" },
      },
    });
    expect(recipeModel.findMany).toHaveBeenCalledWith({
      where: { category: "FISK", name: { contains: "suppe" } },
      orderBy: { createdAt: "desc" },
      skip: 2,
      take: 2,
      include: { ingredients: { include: { ingredient: true } } },
    });

    expect(result).toEqual({
      total: 5,
      page: 2,
      pageSize: 2,
      items: [
        {
          id: "rec1",
          name: "Laksesuppe",
          description: undefined,
          category: "FISK",
          everydayScore: 4,
          healthScore: 3,
          lastUsed: undefined,
          usageCount: 2,
          ingredients: [
            {
              ingredientId: "ing1",
              name: "Laks",
              unit: "stk",
              quantity: 1,
              notes: undefined,
            },
          ],
        },
      ],
    });
  });

  it("returns recipe by id or throws when missing", async () => {
    recipeModel.findUnique.mockResolvedValueOnce({
      id: "rec2",
      name: "Pizza",
      description: "Test",
      category: "ANNET",
      everydayScore: 3,
      healthScore: 2,
      lastUsed: new Date("2024-01-01T00:00:00.000Z"),
      usageCount: 1,
      ingredients: [],
    });

    const caller = createCaller();
    const found = await caller.getById({
      id: "00000000-0000-0000-0000-000000000010",
    });

    expect(found).toMatchObject({
      id: "rec2",
      description: "Test",
      lastUsed: new Date("2024-01-01T00:00:00.000Z"),
    });

    recipeModel.findUnique.mockResolvedValueOnce(null);
    await expect(
      caller.getById({ id: "00000000-0000-0000-0000-000000000011" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("creates recipe with decimal quantities and trimmed nested data", async () => {
    const createdRecord = {
      id: "rec3",
      name: "gryte",
      description: null,
      category: "ANNET",
      everydayScore: 5,
      healthScore: 4,
      lastUsed: null,
      usageCount: 0,
      ingredients: [
        {
          ingredientId: "ingA",
          ingredient: { name: "Løk", unit: null },
          quantity: new Prisma.Decimal("2"),
          notes: null,
        },
      ],
    };

    recipeModel.create.mockResolvedValueOnce(createdRecord);

    const caller = createCaller();
    const input = {
      name: "gryte",
      description: undefined,
      category: "ANNET" as const,
      everydayScore: 5,
      healthScore: 4,
      ingredients: [
        {
          name: "  Løk  ",
          quantity: " 2 ",
          unit: "  stk ",
          notes: "  hakket  ",
        },
      ],
    };

    const result = await caller.create(input);

    expect(recipeModel.create).toHaveBeenCalledWith({
      data: {
        name: "gryte",
        description: undefined,
        category: "ANNET",
        everydayScore: 5,
        healthScore: 4,
        ingredients: {
          create: [
            {
              notes: "hakket",
              quantity: new Prisma.Decimal("2"),
              ingredient: {
                connectOrCreate: {
                  where: { name: "Løk" },
                  create: { name: "Løk", unit: "stk" },
                },
              },
            },
          ],
        },
      },
      include: { ingredients: { include: { ingredient: true } } },
    });

    expect(result).toEqual({
      id: "rec3",
      name: "gryte",
      description: undefined,
      category: "ANNET",
      everydayScore: 5,
      healthScore: 4,
      lastUsed: undefined,
      usageCount: 0,
      ingredients: [
        {
          ingredientId: "ingA",
          name: "Løk",
          unit: undefined,
          quantity: 2,
          notes: undefined,
        },
      ],
    });
  });

  it("wraps create errors in TRPCError", async () => {
    recipeModel.create.mockRejectedValueOnce(new Error("fail"));

    const caller = createCaller();
    await expect(
      caller.create({
        name: "gryte",
        description: undefined,
        category: "ANNET",
        everydayScore: 3,
        healthScore: 3,
        ingredients: [],
      })
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("updates recipe with full ingredient replacement", async () => {
    recipeModel.findUnique.mockResolvedValueOnce({ id: "rec4" });
    recipeModel.update.mockResolvedValueOnce({
      id: "rec4",
      name: "gryte",
      description: "ny",
      category: "ANNET",
      everydayScore: 4,
      healthScore: 4,
      lastUsed: null,
      usageCount: 1,
      ingredients: [],
    });

    const caller = createCaller();
    const payload = {
      id: "00000000-0000-0000-0000-000000000044",
      name: "gryte",
      description: "ny",
      category: "ANNET" as const,
      everydayScore: 4,
      healthScore: 4,
      ingredients: [
        { name: "Tomat", quantity: 1, unit: "stk" },
      ],
    };

    const updated = await caller.update(payload);

    expect(recipeModel.update).toHaveBeenCalledWith({
      where: { id: payload.id },
      data: {
        name: "gryte",
        description: "ny",
        category: "ANNET",
        everydayScore: 4,
        healthScore: 4,
        ingredients: {
          deleteMany: {},
          create: [
            {
              notes: null,
              quantity: new Prisma.Decimal("1"),
              ingredient: {
                connectOrCreate: {
                  where: { name: "Tomat" },
                  create: { name: "Tomat", unit: "stk" },
                },
              },
            },
          ],
        },
      },
      include: { ingredients: { include: { ingredient: true } } },
    });

    expect(updated).toMatchObject({ id: "rec4", description: "ny" });
  });

  it("throws if recipe to update is missing", async () => {
    recipeModel.findUnique.mockResolvedValueOnce(null);

    const caller = createCaller();
    await expect(
      caller.update({
        id: "00000000-0000-0000-0000-000000000055",
        name: "gryte",
        description: undefined,
        category: "ANNET",
        everydayScore: 3,
        healthScore: 3,
        ingredients: [],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deletes recipes and converts failures to TRPCError", async () => {
    recipeModel.delete.mockResolvedValueOnce({ id: "rec5" });

    const caller = createCaller();
    const result = await caller.delete({
      id: "00000000-0000-0000-0000-000000000066",
    });
    expect(result).toEqual({ ok: true });

    recipeModel.delete.mockRejectedValueOnce(new Error("fk"));
    await expect(
      caller.delete({ id: "00000000-0000-0000-0000-000000000067" })
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("marks recipe as used and bumps counters", async () => {
    const lastUsed = new Date("2024-02-02T00:00:00.000Z");
    recipeModel.update.mockResolvedValueOnce({
      id: "rec6",
      usageCount: 5,
      lastUsed,
    });

    const caller = createCaller();
    const result = await caller.markUsed({
      id: "00000000-0000-0000-0000-000000000077",
    });

    expect(recipeModel.update).toHaveBeenCalledWith({
      where: { id: "00000000-0000-0000-0000-000000000077" },
      data: { usageCount: { increment: 1 }, lastUsed: expect.any(Date) },
    });
    expect(result).toEqual({ id: "rec6", usageCount: 5, lastUsed });
  });
});
