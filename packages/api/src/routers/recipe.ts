import { prisma } from "@repo/database";
import { router, publicProcedure } from "../trpc";
import { Diet, RecipeCreate, RecipeListQuery } from "../schemas";
import { z } from "zod";

export const recipeRouter = router({
  list: publicProcedure.input(RecipeListQuery).query(({ input }) => {
    const { householdId, diet, search } = input;
    return prisma.recipe.findMany({
      where: {
        householdId,
        active: true,
        ...(diet ? { diet } : {}),
        ...(search
          ? { title: { contains: search, mode: "insensitive" } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }),
  create: publicProcedure.input(RecipeCreate).mutation(({ input }) => {
    return prisma.recipe.create({ data: input });
  }),
  update: publicProcedure
    .input(
      RecipeCreate.extend({ id: z.string().uuid() })
    )
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return prisma.recipe.update({ where: { id }, data });
    }),
  archive: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ input }) =>
      prisma.recipe.update({ where: { id: input.id }, data: { active: false } })
    ),
});

