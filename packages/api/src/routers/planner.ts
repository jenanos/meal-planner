import { prisma } from "@repo/database";
import { router, publicProcedure } from "../trpc";
import { PlannerInput, SaveWeekInput, Day } from "../schemas";

const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

function shuffle<T>(arr: T[]) {
  return [...arr].sort(() => Math.random() - 0.5);
}

export function selectRecipes<
  R extends { id: string; title: string; diet: string }
>(recipes: R[], weeklyTargets: Record<string, number>) {
  const selected: R[] = [];
  Object.keys(weeklyTargets).forEach((diet) => {
    const need = weeklyTargets[diet] ?? 0;
    const pool = shuffle(recipes.filter((r) => r.diet === diet));
    selected.push(...pool.slice(0, need));
  });
  let i = 0;
  while (selected.length < 7 && recipes.length > 0) {
    selected.push(recipes[i % recipes.length]);
    i++;
  }
  return selected;
}

export const plannerRouter = router({
  generateWeek: publicProcedure
    .input(PlannerInput)
    .mutation(async ({ input }) => {
      const { householdId, weeklyTargets, weekStart } = input;
      const recipes = await prisma.recipe.findMany({
        where: { householdId, active: true },
      });
      const selected = selectRecipes(recipes, weeklyTargets);
      const items = days.map((day, idx) => {
        const r = selected[idx];
        return {
          day, // typed as Day
          recipeId: r?.id ?? null,
          title: r?.title ?? "",
          diet: r?.diet ?? "MEAT",
        };
      });
      return { plan: { weekStart, items } };
    }),
  saveWeek: publicProcedure
    .input(SaveWeekInput)
    .mutation(async ({ input }) => {
      const { householdId, weekStart, items } = input;
      const plan = await prisma.mealPlan.create({
        data: {
          householdId,
          weekStart: new Date(weekStart),
          items: {
            create: items.map((i) => ({ day: i.day, recipeId: i.recipeId })),
          },
        },
        include: { items: true },
      });
      return plan;
    }),
});

