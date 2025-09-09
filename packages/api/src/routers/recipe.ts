import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { prisma } from "@repo/database";


export const recipeRouter = router({
  list: publicProcedure.query(() =>
    prisma.recipe.findMany({ where: { active: true } })
  ),
  create: publicProcedure.input(z.object({
    title: z.string().min(2),
    diet: z.enum(["MEAT","FISH","VEG"]),
    description: z.string().optional(),
    prepMinutes: z.number().int().positive().optional()
  })).mutation(({ input }) =>
    prisma.recipe.create({
      data: { ...input, householdId: "demo-household" }
    })
  )
});
