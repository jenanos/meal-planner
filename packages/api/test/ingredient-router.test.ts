import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    ingredient: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    recipeIngredient: {
      findMany: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    shoppingPackageItem: {
      findMany: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@repo/database", () => ({
  prisma: prismaMock,
}));

import { ingredientRouter } from "../src/routers/ingredient";

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
  ingredientRouter.createCaller({
    user: USER,
    householdId: HOUSEHOLD_ID,
    ...ctx,
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ingredient router", () => {
  it("lists ingredients with trimmed search and normalized categories", async () => {
    prismaMock.ingredient.findMany.mockResolvedValueOnce([
      {
        id: "00000000-0000-0000-0000-000000000001",
        name: "Paprika",
        unit: null,
        isPantryItem: false,
        category: "GRONNSAKER",
        _count: { recipes: 3 },
      },
    ]);

    const result = await createCaller().list({ search: "  pap  " });

    expect(prismaMock.ingredient.findMany).toHaveBeenCalledWith({
      where: { name: { contains: "pap", mode: "insensitive" } },
      orderBy: { name: "asc" },
      include: { _count: { select: { recipes: true } } },
    });
    expect(result).toEqual([
      {
        id: "00000000-0000-0000-0000-000000000001",
        name: "Paprika",
        unit: undefined,
        usageCount: 3,
        isPantryItem: false,
        category: "FRUKT_OG_GRONT",
      },
    ]);
  });

  it("lists all ingredients when search is omitted", async () => {
    prismaMock.ingredient.findMany.mockResolvedValueOnce([]);

    await createCaller().list({});

    expect(prismaMock.ingredient.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { name: "asc" },
      include: { _count: { select: { recipes: true } } },
    });
  });

  it("trims input and upserts on create", async () => {
    prismaMock.ingredient.upsert.mockResolvedValueOnce({
      id: "00000000-0000-0000-0000-000000000002",
      name: "Timian",
      unit: "ts",
      isPantryItem: true,
      category: "UKATEGORISERT",
    });

    const result = await createCaller().create({
      name: "  Timian  ",
      unit: "  ts  ",
      isPantryItem: true,
      category: "ANNET",
    });

    expect(prismaMock.ingredient.upsert).toHaveBeenCalledWith({
      where: { name: "Timian" },
      update: { unit: "ts", isPantryItem: true, category: "ANNET" },
      create: {
        name: "Timian",
        unit: "ts",
        isPantryItem: true,
        category: "ANNET",
      },
    });
    expect(result).toEqual({
      id: "00000000-0000-0000-0000-000000000002",
      name: "Timian",
      unit: "ts",
      isPantryItem: true,
      category: "ANNET",
    });
  });

  it("wraps upsert errors in TRPCError", async () => {
    prismaMock.ingredient.upsert.mockRejectedValueOnce(new Error("duplicate"));

    await expect(
      createCaller().create({ name: "Basilikum" })
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("updates an ingredient and maps missing rows to NOT_FOUND", async () => {
    prismaMock.ingredient.update
      .mockResolvedValueOnce({
        id: "00000000-0000-0000-0000-000000000003",
        name: "Løk",
        unit: "stk",
        isPantryItem: true,
        category: "GRONNSAKER",
      })
      .mockRejectedValueOnce({ code: "P2025" });

    const caller = createCaller();
    const updated = await caller.update({
      id: "00000000-0000-0000-0000-000000000003",
      name: "  Løk  ",
      unit: "  stk  ",
      isPantryItem: true,
      category: "FRUKT_OG_GRONT",
    });

    expect(prismaMock.ingredient.update).toHaveBeenNthCalledWith(1, {
      where: { id: "00000000-0000-0000-0000-000000000003" },
      data: {
        name: "Løk",
        unit: "stk",
        isPantryItem: true,
        category: "FRUKT_OG_GRONT",
      },
    });
    expect(updated).toEqual({
      id: "00000000-0000-0000-0000-000000000003",
      name: "Løk",
      unit: "stk",
      isPantryItem: true,
      category: "FRUKT_OG_GRONT",
    });

    await expect(
      caller.update({
        id: "00000000-0000-0000-0000-000000000004",
        name: "Pepper",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns an ingredient with attached recipes", async () => {
    prismaMock.ingredient.findUnique.mockResolvedValueOnce({
      id: "00000000-0000-0000-0000-000000000005",
      name: "Løk",
      unit: null,
      isPantryItem: false,
      category: "UKATEGORISERT",
      recipes: [
        {
          recipe: {
            id: "00000000-0000-0000-0000-000000000201",
            name: "Suppe",
            category: "ANNET",
            everydayScore: 2,
            healthScore: 4,
          },
        },
      ],
    });

    const result = await createCaller().getWithRecipes({
      id: "00000000-0000-0000-0000-000000000005",
    });

    expect(result).toEqual({
      id: "00000000-0000-0000-0000-000000000005",
      name: "Løk",
      unit: undefined,
      isPantryItem: false,
      category: "ANNET",
      recipes: [
        {
          id: "00000000-0000-0000-0000-000000000201",
          name: "Suppe",
          category: "ANNET",
          everydayScore: 2,
          healthScore: 4,
        },
      ],
    });
  });

  it("throws NOT_FOUND when ingredient is missing", async () => {
    prismaMock.ingredient.findUnique.mockResolvedValueOnce(null);

    await expect(
      createCaller().getWithRecipes({
        id: "00000000-0000-0000-0000-000000000006",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lists ingredients without unit", async () => {
    prismaMock.ingredient.findMany.mockResolvedValueOnce([
      {
        id: "00000000-0000-0000-0000-000000000007",
        name: "Løk",
        unit: null,
        isPantryItem: false,
        category: "GRONNSAKER",
        _count: { recipes: 2 },
      },
      {
        id: "00000000-0000-0000-0000-000000000008",
        name: "Mel",
        unit: null,
        isPantryItem: true,
        category: "TORRVARER",
        _count: { recipes: 5 },
      },
    ]);

    const result = await createCaller().listWithoutUnit();

    expect(prismaMock.ingredient.findMany).toHaveBeenCalledWith({
      where: { unit: null },
      orderBy: { name: "asc" },
      include: { _count: { select: { recipes: true } } },
    });
    expect(result).toEqual([
      {
        id: "00000000-0000-0000-0000-000000000007",
        name: "Løk",
        unit: undefined,
        usageCount: 2,
        isPantryItem: false,
        category: "FRUKT_OG_GRONT",
      },
      {
        id: "00000000-0000-0000-0000-000000000008",
        name: "Mel",
        unit: undefined,
        usageCount: 5,
        isPantryItem: true,
        category: "TORRVARER",
      },
    ]);
  });

  it("finds potential duplicate ingredients and skips empty normalized names", async () => {
    prismaMock.ingredient.findMany.mockResolvedValueOnce([
      {
        id: "00000000-0000-0000-0000-000000000009",
        name: "!!!",
        unit: "stk",
        isPantryItem: false,
        category: "ANNET",
        _count: { recipes: 0 },
      },
      {
        id: "00000000-0000-0000-0000-000000000010",
        name: "Løk",
        unit: "stk",
        isPantryItem: false,
        category: "GRONNSAKER",
        _count: { recipes: 2 },
      },
      {
        id: "00000000-0000-0000-0000-000000000011",
        name: "Løk, rød",
        unit: "stk",
        isPantryItem: false,
        category: "GRONNSAKER",
        _count: { recipes: 3 },
      },
    ]);

    const result = await createCaller().listPotentialDuplicates();

    expect(prismaMock.ingredient.findMany).toHaveBeenCalledWith({
      orderBy: { name: "asc" },
      include: { _count: { select: { recipes: true } } },
    });
    expect(result).toEqual([
      [
        {
          id: "00000000-0000-0000-0000-000000000010",
          name: "Løk",
          unit: "stk",
          usageCount: 2,
          isPantryItem: false,
          category: "FRUKT_OG_GRONT",
        },
        {
          id: "00000000-0000-0000-0000-000000000011",
          name: "Løk, rød",
          unit: "stk",
          usageCount: 3,
          isPantryItem: false,
          category: "FRUKT_OG_GRONT",
        },
      ],
    ]);
  });

  it("lists ingredients whose normalized category is ANNET", async () => {
    prismaMock.ingredient.findMany.mockResolvedValueOnce([
      {
        id: "00000000-0000-0000-0000-000000000012",
        name: "Mystery",
        unit: null,
        isPantryItem: false,
        category: "UKATEGORISERT",
        _count: { recipes: 1 },
      },
      {
        id: "00000000-0000-0000-0000-000000000013",
        name: "Melk",
        unit: "l",
        isPantryItem: false,
        category: "MEIERI_OG_EGG",
        _count: { recipes: 2 },
      },
    ]);

    const result = await createCaller().listWithoutCategory();

    expect(result).toEqual([
      {
        id: "00000000-0000-0000-0000-000000000012",
        name: "Mystery",
        unit: undefined,
        usageCount: 1,
        isPantryItem: false,
        category: "ANNET",
      },
    ]);
  });

  it("bulk updates units and skips failed rows", async () => {
    prismaMock.ingredient.update
      .mockResolvedValueOnce({
        id: "00000000-0000-0000-0000-000000000014",
        name: "Løk",
        unit: "stk",
        isPantryItem: false,
        category: "GRONNSAKER",
      })
      .mockRejectedValueOnce(new Error("Not found"));

    const result = await createCaller().bulkUpdateUnits({
      updates: [
        { id: "00000000-0000-0000-0000-000000000014", unit: " stk " },
        { id: "00000000-0000-0000-0000-000000000015", unit: " g " },
      ],
    });

    expect(prismaMock.ingredient.update).toHaveBeenNthCalledWith(1, {
      where: { id: "00000000-0000-0000-0000-000000000014" },
      data: { unit: "stk" },
    });
    expect(prismaMock.ingredient.update).toHaveBeenNthCalledWith(2, {
      where: { id: "00000000-0000-0000-0000-000000000015" },
      data: { unit: "g" },
    });
    expect(result).toEqual({ count: 1 });
  });

  it("rejects whitespace-only units during bulk updates", async () => {
    await expect(
      createCaller().bulkUpdateUnits({
        updates: [
          { id: "00000000-0000-0000-0000-000000000016", unit: "   " },
        ],
      })
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("bulk updates categories and pantry flags", async () => {
    prismaMock.ingredient.update
      .mockResolvedValueOnce({
        id: "00000000-0000-0000-0000-000000000017",
        name: "Ris",
        unit: "g",
        isPantryItem: true,
        category: "TORRVARER",
      })
      .mockRejectedValueOnce(new Error("missing"))
      .mockResolvedValueOnce({
        id: "00000000-0000-0000-0000-000000000019",
        name: "Salt",
        unit: "g",
        isPantryItem: true,
        category: "TORRVARER",
      })
      .mockRejectedValueOnce(new Error("missing"));

    const caller = createCaller();
    const categoryResult = await caller.bulkUpdateCategories({
      updates: [
        {
          id: "00000000-0000-0000-0000-000000000017",
          category: "TORRVARER",
        },
        {
          id: "00000000-0000-0000-0000-000000000018",
          category: "KJOTT",
        },
      ],
    });
    const pantryResult = await caller.bulkUpdatePantryItems({
      updates: [
        {
          id: "00000000-0000-0000-0000-000000000019",
          isPantryItem: true,
        },
        {
          id: "00000000-0000-0000-0000-000000000020",
          isPantryItem: false,
        },
      ],
    });

    expect(prismaMock.ingredient.update).toHaveBeenNthCalledWith(1, {
      where: { id: "00000000-0000-0000-0000-000000000017" },
      data: { category: "TORRVARER" },
    });
    expect(prismaMock.ingredient.update).toHaveBeenNthCalledWith(2, {
      where: { id: "00000000-0000-0000-0000-000000000018" },
      data: { category: "KJOTT" },
    });
    expect(prismaMock.ingredient.update).toHaveBeenNthCalledWith(3, {
      where: { id: "00000000-0000-0000-0000-000000000019" },
      data: { isPantryItem: true },
    });
    expect(prismaMock.ingredient.update).toHaveBeenNthCalledWith(4, {
      where: { id: "00000000-0000-0000-0000-000000000020" },
      data: { isPantryItem: false },
    });
    expect(categoryResult).toEqual({ count: 1 });
    expect(pantryResult).toEqual({ count: 1 });
  });

  it("merges ingredients across recipe links and shopping package items", async () => {
    prismaMock.ingredient.findUnique.mockResolvedValueOnce({
      id: "00000000-0000-0000-0000-000000000021",
      name: "Løk",
    });

    const tx = {
      recipeIngredient: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              recipeId: "00000000-0000-0000-0000-000000000301",
              ingredientId: "00000000-0000-0000-0000-000000000022",
            },
            {
              recipeId: "00000000-0000-0000-0000-000000000302",
              ingredientId: "00000000-0000-0000-0000-000000000023",
            },
          ])
          .mockResolvedValueOnce([
            {
              recipeId: "00000000-0000-0000-0000-000000000301",
              ingredientId: "00000000-0000-0000-0000-000000000021",
            },
          ]),
        delete: vi.fn(),
        update: vi.fn(),
      },
      shoppingPackageItem: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              id: "00000000-0000-0000-0000-000000000401",
              packageId: "00000000-0000-0000-0000-000000000501",
              ingredientId: "00000000-0000-0000-0000-000000000022",
            },
            {
              id: "00000000-0000-0000-0000-000000000402",
              packageId: "00000000-0000-0000-0000-000000000502",
              ingredientId: "00000000-0000-0000-0000-000000000023",
            },
          ])
          .mockResolvedValueOnce([
            { packageId: "00000000-0000-0000-0000-000000000501" },
          ]),
        delete: vi.fn(),
        update: vi.fn(),
      },
      ingredient: {
        deleteMany: vi.fn(),
      },
    };

    prismaMock.$transaction.mockImplementationOnce(async (callback) => callback(tx));

    const result = await createCaller().merge({
      keepId: "00000000-0000-0000-0000-000000000021",
      mergeIds: [
        "00000000-0000-0000-0000-000000000021",
        "00000000-0000-0000-0000-000000000022",
        "00000000-0000-0000-0000-000000000023",
      ],
    });

    expect(tx.recipeIngredient.delete).toHaveBeenCalledWith({
      where: {
        recipeId_ingredientId: {
          recipeId: "00000000-0000-0000-0000-000000000301",
          ingredientId: "00000000-0000-0000-0000-000000000022",
        },
      },
    });
    expect(tx.recipeIngredient.update).toHaveBeenCalledWith({
      where: {
        recipeId_ingredientId: {
          recipeId: "00000000-0000-0000-0000-000000000302",
          ingredientId: "00000000-0000-0000-0000-000000000023",
        },
      },
      data: { ingredientId: "00000000-0000-0000-0000-000000000021" },
    });
    expect(tx.shoppingPackageItem.delete).toHaveBeenCalledWith({
      where: { id: "00000000-0000-0000-0000-000000000401" },
    });
    expect(tx.shoppingPackageItem.update).toHaveBeenCalledWith({
      where: { id: "00000000-0000-0000-0000-000000000402" },
      data: {
        ingredientId: "00000000-0000-0000-0000-000000000021",
        displayName: "Løk",
      },
    });
    expect(tx.ingredient.deleteMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: [
            "00000000-0000-0000-0000-000000000022",
            "00000000-0000-0000-0000-000000000023",
          ],
        },
      },
    });
    expect(result).toEqual({ mergedCount: 2, updatedRecipes: 1 });
  });

  it("rejects invalid merge requests", async () => {
    const caller = createCaller();

    await expect(
      caller.merge({
        keepId: "00000000-0000-0000-0000-000000000024",
        mergeIds: ["00000000-0000-0000-0000-000000000024"],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    prismaMock.ingredient.findUnique.mockResolvedValueOnce(null);
    await expect(
      caller.merge({
        keepId: "00000000-0000-0000-0000-000000000025",
        mergeIds: ["00000000-0000-0000-0000-000000000026"],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("requires authentication and household membership", async () => {
    await expect(
      createCaller({ user: null, householdId: null }).list({})
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
