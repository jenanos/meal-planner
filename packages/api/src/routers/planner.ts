import { prisma } from "@repo/database";
import { router, publicProcedure } from "../trpc";
import { PlannerConstraints, WeekPlanInput } from "../schemas";
import { z } from "zod";

type RecipeDTO = {
  id: string;
  name: string;
  category: "FISK" | "VEGETAR" | "KYLLING" | "STORFE" | "ANNET";
  everydayScore: number;
  healthScore: number;
  lastUsed?: Date | null;
  usageCount: number;
  ingredients: { ingredientId: string; name: string }[];
};

function toDTO(r: any): RecipeDTO {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    everydayScore: r.everydayScore,
    healthScore: r.healthScore,
    lastUsed: r.lastUsed ?? null,
    usageCount: r.usageCount,
    ingredients: (r.ingredients ?? []).map((ri: any) => ({
      ingredientId: ri.ingredientId,
      name: ri.ingredient.name,
    })),
  };
}

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

function daysSince(d?: Date | null) {
  if (!d) return Infinity;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export const plannerRouter = router({
  generateWeekPlan: publicProcedure
    .input(PlannerConstraints.optional())
    .mutation(async ({ input }) => {
      const cfg = {
        fish: input?.fish ?? 2,
        vegetarian: input?.vegetarian ?? 3,
        chicken: input?.chicken ?? 1,
        beef: input?.beef ?? 1,
        preferRecentGapDays: input?.preferRecentGapDays ?? 21,
      };

      const all = await prisma.recipe.findMany({
        include: { ingredients: { include: { ingredient: true } } },
      });
      const pool = all.map(toDTO);

      const target: Record<RecipeDTO["category"], number> = {
        FISK: cfg.fish,
        VEGETAR: cfg.vegetarian,
        KYLLING: cfg.chicken,
        STORFE: cfg.beef,
        ANNET: 0,
      };

      const usedIng = new Set<string>();
      const chosen: RecipeDTO[] = [];

      const score = (r: RecipeDTO, dayIndex: number) => {
        // Base scoring
        let s = 0;

        // Dag-regler
        const isMonWed = dayIndex <= 2;
        const isThuSat = dayIndex >= 3 && dayIndex <= 5;

        if (isMonWed) {
          // Foretrekk hverdagsvennlig og sunnere
          s += (4 - Math.min(r.everydayScore, 4)) * 2; // lav score bedre
          s += (r.healthScore >= 4 ? 2 : 0);
        } else if (isThuSat) {
          // Tillat helgekos
          s += (r.everydayScore >= 4 ? 2 : 0);
          s += (r.healthScore >= 3 ? 1 : 0);
        } else {
          // Søndag balanser rest
          s += 1;
        }

        // Ingrediens-overlapp
        const overlap = r.ingredients.reduce((acc, i) => acc + (usedIng.has(i.ingredientId) ? 1 : 0), 0);
        s += overlap * 1.5;

        // Recency
        const ds = daysSince(r.lastUsed ?? undefined);
        if (ds >= cfg.preferRecentGapDays) s += 2;
        else if (ds < 7) s -= 2;

        // Straff hvis kategori-kvote allerede oppfylt
        const catLeft = target[r.category];
        if (catLeft <= 0) s -= 5;

        return s;
      };

      // Greedy m/enkelt backoff
      for (const dayIndex of DAYS) {
        // Kandidater: de med kvote igjen eller ANNET hvis tomt
        const candidates = pool
          .filter((r) => target[r.category] > 0 || r.category === "ANNET")
          .filter((r) => !chosen.some((c) => c.id === r.id));

        candidates.sort((a, b) => score(b, dayIndex) - score(a, dayIndex));
        const pick = candidates[0] ?? pool.find((r) => !chosen.some((c) => c.id === r.id));
        if (pick) {
          chosen.push(pick);
          target[pick.category] = Math.max(0, target[pick.category] - 1);
          pick.ingredients.forEach((i) => usedIng.add(i.ingredientId));
        }
      }

      const selectedIds = new Set(chosen.map((r) => r.id));
      const alternatives = pool
        .filter((r) => !selectedIds.has(r.id))
        .sort((a, b) => (b.healthScore - a.healthScore) + (a.everydayScore - b.everydayScore))
        .slice(0, 10);

      return {
        days: DAYS.map((i) => ({ dayIndex: i, recipe: chosen[i] ?? null })),
        alternatives,
      };
    }),

  suggestions: publicProcedure
    .input(z.object({ excludeIds: z.array(z.string().uuid()).default([]) }).optional())
    .query(async ({ input }) => {
      const all = await prisma.recipe.findMany({
        include: { ingredients: { include: { ingredient: true } } },
      });
      const exclude = new Set(input?.excludeIds ?? []);
      return all.filter((r) => !exclude.has(r.id)).slice(0, 10).map(toDTO);
    }),

  saveWeekPlan: publicProcedure
    .input(WeekPlanInput)
    .mutation(async ({ input }) => {
      const { weekStart, recipeIdsByDay } = input;
      if (recipeIdsByDay.length !== 7) {
        throw new Error("recipeIdsByDay must have length 7");
      }

      const plan = await prisma.weekPlan.upsert({
        where: { weekStart: new Date(weekStart) },
        update: {},
        create: { weekStart: new Date(weekStart) },
      });

      // Upsert 7 entries (unik (weekPlanId, dayIndex))
      for (let i = 0; i < 7; i++) {
        const recipeId = recipeIdsByDay[i];
        await prisma.weekPlanEntry.upsert({
          where: { weekPlanId_dayIndex: { weekPlanId: plan.id, dayIndex: i } },
          update: { recipeId },
          create: { weekPlanId: plan.id, dayIndex: i, recipeId },
        });
      }

      // Markér brukt
      await Promise.all(
        recipeIdsByDay.map((id) =>
          prisma.recipe.update({ where: { id }, data: { usageCount: { increment: 1 }, lastUsed: new Date() } })
        )
      );

      const full = await prisma.weekPlan.findUnique({
        where: { id: plan.id },
        include: { entries: { include: { recipe: true } } },
      });

      return full;
    }),
});

