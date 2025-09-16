import { prisma } from "@repo/database";
import { router, publicProcedure } from "../trpc";
import { RecipeCreate, RecipeListQuery } from "../schemas";
import { z } from "zod";

export const recipeRouter = router({
  list: publicProcedure.input(RecipeListQuery).query(({ input }) => {
    const { householdId, diet, search } = input;
    return prisma.recipe.findMany({
      where: {
        householdId,
        active: true,
        ...(diet ? { diet } : {}),
        ...(search ? { title: { contains: search } } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { ingredients: { include: { ingredient: true } } },
    });
  }),
  create: publicProcedure.input(RecipeCreate).mutation(({ input }) => {
    const { ingredients = [], ...data } = input;
    return prisma.recipe.create({
      data: {
        ...data,
        ingredients: {
          create: ingredients.map((i) => ({
            quantity: i.quantity ?? null,
            unit: i.unit ?? null,
            ingredient: {
              connectOrCreate: {
                where: {
                  Ingredient_householdId_name_key: {
                    householdId: data.householdId,
                    name: i.name.trim(),
                  },
                },
                create: {
                  householdId: data.householdId,
                  name: i.name.trim(),
                },
              },
            },
          })),
        },
      },
      include: { ingredients: { include: { ingredient: true } } },
    });
  }),
  update: publicProcedure
    .input(RecipeCreate.extend({ id: z.string().uuid() }))
    .mutation(({ input }) => {
      const { id, ingredients = [], ...data } = input;
      return prisma.recipe.update({
        where: { id },
        data: {
          ...data,
          ingredients: {
            deleteMany: {},
            create: ingredients.map((i) => ({
              quantity: i.quantity ?? null,
              unit: i.unit ?? null,
              ingredient: {
                connectOrCreate: {
                  where: {
                    Ingredient_householdId_name_key: {
                      householdId: data.householdId,
                      name: i.name.trim(),
                    },
                  },
                  create: {
                    householdId: data.householdId,
                    name: i.name.trim(),
                  },
                },
              },
            })),
          },
        },
        include: { ingredients: { include: { ingredient: true } } },
      });
    }),
  archive: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ input }) =>
      prisma.recipe.update({ where: { id: input.id }, data: { active: false } })
    ),
});
