import { prisma } from "@repo/database";
import { router, protectedProcedure } from "../trpc.js";
import { FreezerItemUpsert, FreezerItemRemove, FreezerItemUpdateDates } from "../schemas.js";

/** Default shelf life in months per recipe category */
const EXPIRY_MONTHS: Record<string, number> = {
  STORFE: 6,
  KYLLING: 4,
  FISK: 2,
  VEGETAR: 3,
  ANNET: 3,
};

function computeExpiresAt(frozenAt: Date, category: string): Date {
  const months = EXPIRY_MONTHS[category] ?? 3;
  const expires = new Date(frozenAt);
  expires.setMonth(expires.getMonth() + months);
  return expires;
}

function serializeItem(item: {
  id: string;
  recipeId: string;
  quantity: number;
  frozenAt: Date;
  expiresAt: Date;
  recipe: { id: string; name: string; category: string };
}) {
  return {
    id: item.id,
    recipeId: item.recipeId,
    recipeName: item.recipe.name,
    recipeCategory: item.recipe.category,
    quantity: item.quantity,
    frozenAt: item.frozenAt.toISOString(),
    expiresAt: item.expiresAt.toISOString(),
  };
}

const recipeSelect = { id: true, name: true, category: true } as const;

export const freezerRouter = router({
  /** List all freezer items with their recipe details */
  list: protectedProcedure.query(async ({ ctx }) => {
    const items = await prisma.freezerItem.findMany({
      where: { householdId: ctx.householdId },
      include: { recipe: { select: recipeSelect } },
      orderBy: { recipe: { name: "asc" } },
    });
    return items.map(serializeItem);
  }),

  /** Upsert a freezer item – set quantity for a recipe. If quantity is 0, removes the item. */
  upsert: protectedProcedure.input(FreezerItemUpsert).mutation(async ({ input, ctx }) => {
    const householdId = ctx.householdId;

    if (input.quantity <= 0) {
      await prisma.freezerItem.deleteMany({
        where: { recipeId: input.recipeId, householdId },
      });
      return null;
    }

    // Look up recipe category to compute default expiry
    const recipe = await prisma.recipe.findUniqueOrThrow({
      where: { id: input.recipeId },
      select: recipeSelect,
    });

    const frozenAt = input.frozenAt ? new Date(input.frozenAt) : new Date();
    const expiresAt = input.expiresAt
      ? new Date(input.expiresAt)
      : computeExpiresAt(frozenAt, recipe.category);

    const item = await prisma.freezerItem.upsert({
      where: { recipeId_householdId: { recipeId: input.recipeId, householdId } },
      update: {
        quantity: input.quantity,
        ...(input.frozenAt != null ? { frozenAt } : {}),
        ...(input.expiresAt != null ? { expiresAt } : {}),
      },
      create: { recipeId: input.recipeId, householdId, quantity: input.quantity, frozenAt, expiresAt },
      include: { recipe: { select: recipeSelect } },
    });
    return serializeItem(item);
  }),

  /** Update dates on an existing freezer item */
  updateDates: protectedProcedure.input(FreezerItemUpdateDates).mutation(async ({ input, ctx }) => {
    const householdId = ctx.householdId;
    const data: { frozenAt?: Date; expiresAt?: Date } = {};
    if (input.frozenAt != null) data.frozenAt = new Date(input.frozenAt);
    if (input.expiresAt != null) data.expiresAt = new Date(input.expiresAt);

    const item = await prisma.freezerItem.update({
      where: { recipeId_householdId: { recipeId: input.recipeId, householdId } },
      data,
      include: { recipe: { select: recipeSelect } },
    });
    return serializeItem(item);
  }),

  /** Remove a freezer item entirely */
  remove: protectedProcedure.input(FreezerItemRemove).mutation(async ({ input, ctx }) => {
    await prisma.freezerItem.deleteMany({
      where: { recipeId: input.recipeId, householdId: ctx.householdId },
    });
    return { success: true };
  }),

  /** Decrement quantity by 1 (used when picking from freezer for weekly plan) */
  decrement: protectedProcedure.input(FreezerItemRemove).mutation(async ({ input, ctx }) => {
    const householdId = ctx.householdId;
    return prisma.$transaction(async (tx) => {
      // If quantity is exactly 1, delete the item
      const deleteResult = await tx.freezerItem.deleteMany({
        where: { recipeId: input.recipeId, householdId, quantity: 1 },
      });
      if (deleteResult.count > 0) return null;

      // Otherwise, decrement quantity if > 1
      const updateResult = await tx.freezerItem.updateMany({
        where: { recipeId: input.recipeId, householdId, quantity: { gt: 1 } },
        data: { quantity: { decrement: 1 } },
      });
      if (updateResult.count === 0) return null;

      const updated = await tx.freezerItem.findFirst({
        where: { recipeId: input.recipeId, householdId },
      });
      if (!updated) return null;
      return { id: updated.id, recipeId: updated.recipeId, quantity: updated.quantity };
    });
  }),

  /** Increment quantity by 1 (used when removing a freezer meal from weekly plan) */
  increment: protectedProcedure.input(FreezerItemRemove).mutation(async ({ input, ctx }) => {
    const householdId = ctx.householdId;
    // Look up recipe to compute default expiry for potential new item
    const recipe = await prisma.recipe.findUniqueOrThrow({
      where: { id: input.recipeId },
      select: recipeSelect,
    });
    const now = new Date();
    const expiresAt = computeExpiresAt(now, recipe.category);

    const item = await prisma.freezerItem.upsert({
      where: { recipeId_householdId: { recipeId: input.recipeId, householdId } },
      update: { quantity: { increment: 1 } },
      create: { recipeId: input.recipeId, householdId, quantity: 1, frozenAt: now, expiresAt },
    });
    return { id: item.id, recipeId: item.recipeId, quantity: item.quantity };
  }),
});
