import { prisma } from "@repo/database";
import { router, publicProcedure } from "../trpc.js";
import { FreezerItemUpsert, FreezerItemRemove } from "../schemas.js";

export const freezerRouter = router({
  /** List all freezer items with their recipe details */
  list: publicProcedure.query(async () => {
    const items = await prisma.freezerItem.findMany({
      include: {
        recipe: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
      },
      orderBy: { recipe: { name: "asc" } },
    });
    return items.map((item) => ({
      id: item.id,
      recipeId: item.recipeId,
      recipeName: item.recipe.name,
      recipeCategory: item.recipe.category,
      quantity: item.quantity,
    }));
  }),

  /** Upsert a freezer item – set quantity for a recipe. If quantity is 0, removes the item. */
  upsert: publicProcedure.input(FreezerItemUpsert).mutation(async ({ input }) => {
    if (input.quantity <= 0) {
      await prisma.freezerItem.deleteMany({
        where: { recipeId: input.recipeId },
      });
      return null;
    }
    const item = await prisma.freezerItem.upsert({
      where: { recipeId: input.recipeId },
      update: { quantity: input.quantity },
      create: { recipeId: input.recipeId, quantity: input.quantity },
      include: {
        recipe: {
          select: { id: true, name: true, category: true },
        },
      },
    });
    return {
      id: item.id,
      recipeId: item.recipeId,
      recipeName: item.recipe.name,
      recipeCategory: item.recipe.category,
      quantity: item.quantity,
    };
  }),

  /** Remove a freezer item entirely */
  remove: publicProcedure.input(FreezerItemRemove).mutation(async ({ input }) => {
    await prisma.freezerItem.deleteMany({
      where: { recipeId: input.recipeId },
    });
    return { success: true };
  }),

  /** Decrement quantity by 1 (used when picking from freezer for weekly plan) */
  decrement: publicProcedure.input(FreezerItemRemove).mutation(async ({ input }) => {
    return prisma.$transaction(async (tx) => {
      // If quantity is exactly 1, delete the item
      const deleteResult = await tx.freezerItem.deleteMany({
        where: { recipeId: input.recipeId, quantity: 1 },
      });
      if (deleteResult.count > 0) return null;

      // Otherwise, decrement quantity if > 1
      const updateResult = await tx.freezerItem.updateMany({
        where: { recipeId: input.recipeId, quantity: { gt: 1 } },
        data: { quantity: { decrement: 1 } },
      });
      if (updateResult.count === 0) return null;

      const updated = await tx.freezerItem.findUnique({
        where: { recipeId: input.recipeId },
      });
      if (!updated) return null;
      return { id: updated.id, recipeId: updated.recipeId, quantity: updated.quantity };
    });
  }),

  /** Increment quantity by 1 (used when removing a freezer meal from weekly plan) */
  increment: publicProcedure.input(FreezerItemRemove).mutation(async ({ input }) => {
    const item = await prisma.freezerItem.upsert({
      where: { recipeId: input.recipeId },
      update: { quantity: { increment: 1 } },
      create: { recipeId: input.recipeId, quantity: 1 },
    });
    return { id: item.id, recipeId: item.recipeId, quantity: item.quantity };
  }),
});
