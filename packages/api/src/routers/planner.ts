import { prisma } from "@repo/database";
import { router, publicProcedure } from "../trpc";
import { PlannerConstraints, WeekPlanInput } from "../schemas";
import { z } from "zod";

/** Day + meta (kan utvides senere) */
interface DayMeta {
  label: string;
}

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type DayIndex = typeof DAYS[number];

const DAY_META: Record<DayIndex, DayMeta> = {
  0: { label: "Mon" },
  1: { label: "Tue" },
  2: { label: "Wed" },
  3: { label: "Thu" },
  4: { label: "Fri" },
  5: { label: "Sat" },
  6: { label: "Sun" },
};

function getDayMeta(d: DayIndex) {
  return DAY_META[d];
}

type RecipeDTO = {
  id: string;
  name: string;
  category: string;
  everydayScore: number;
  healthScore: number;
  lastUsed: Date | null;
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

function daysSince(d?: Date | null) {
  if (!d) return Infinity;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

/* Suggestions */

const suggestionKindSchema = z.enum(["longGap", "frequent", "search"]);
type SuggestionKind = z.infer<typeof suggestionKindSchema>;

const suggestionInputSchema = z.object({
  excludeIds: z.array(z.string().uuid()).default([]),
  limit: z.number().int().min(1).max(20).default(6),
  type: suggestionKindSchema.default("longGap"),
  search: z.string().optional(),
});
type SuggestionInput = z.infer<typeof suggestionInputSchema>;

function buildSuggestions(
  pool: RecipeDTO[],
  opts: { kind: SuggestionKind; limit: number; exclude: string[]; search?: string }
) {
  const excl = new Set(opts.exclude);
  let cand = pool.filter((r) => !excl.has(r.id));

  if (opts.kind === "search" && opts.search) {
    const q = opts.search.toLowerCase();
    cand = cand.filter((r) => r.name.toLowerCase().includes(q));
  } else if (opts.kind === "longGap") {
    cand = cand.sort((a, b) => daysSince(b.lastUsed) - daysSince(a.lastUsed));
  } else if (opts.kind === "frequent") {
    cand = cand.sort((a, b) => b.usageCount - a.usageCount);
  }

  return cand.slice(0, opts.limit);
}

/* Planner router */

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

      const target: Record<string, number> = {
        FISK: cfg.fish,
        VEGETAR: cfg.vegetarian,
        KYLLING: cfg.chicken,
        STORFE: cfg.beef,
        ANNET: 0,
      };

      const usedIng = new Set<string>();
      const chosen: (RecipeDTO | null)[] = [];
      const selectedIds = new Set<string>();

      const score = (r: RecipeDTO, dayIndex: DayIndex) => {
        const meta = getDayMeta(dayIndex); // meta er ikke brukt ennå – reserveres
        let s = 0;
        const isMonWed = dayIndex <= 2;
        const isThuSat = dayIndex >= 3 && dayIndex <= 5;

        if (isMonWed) {
          s += (4 - Math.min(r.everydayScore, 4)) * 2;
          s += (r.healthScore >= 4 ? 2 : 0);
        } else if (isThuSat) {
          s += (r.everydayScore >= 4 ? 2 : 0);
          s += (r.healthScore >= 3 ? 1 : 0);
        } else {
          s += 1;
        }

        const overlap = r.ingredients.reduce(
          (acc, i) => acc + (usedIng.has(i.ingredientId) ? 1 : 0),
          0
        );
        s += overlap * 1.5;

        const ds = daysSince(r.lastUsed);
        if (ds >= cfg.preferRecentGapDays) s += 2;
        else if (ds < 7) s -= 2;

        if ((target[r.category] ?? 0) <= 0) s -= 5;

        return s;
      };

      for (const dayIndex of DAYS) {
        const candidates = pool
          .filter((r) => (target[r.category] ?? 0) > 0 || r.category === "ANNET")
          .filter((r) => !selectedIds.has(r.id));

        const scored = candidates
          .map((r) => ({ r, s: score(r, dayIndex) }))
          .sort((a, b) => b.s - a.s);

        const pick = scored.length ? scored[0].r : null;
        chosen.push(pick);
        if (pick) {
          selectedIds.add(pick.id);
          target[pick.category] = Math.max(0, (target[pick.category] ?? 0) - 1);
          pick.ingredients.forEach((i) => usedIng.add(i.ingredientId));
        }
      }

      const alternatives = pool
        .filter((r) => !selectedIds.has(r.id))
        .sort(
          (a, b) =>
            (b.healthScore - a.healthScore) + (a.everydayScore - b.everydayScore)
        )
        .slice(0, 10);

      return {
        days: DAYS.map((d) => ({ dayIndex: d, recipe: chosen[d] })),
        alternatives,
      };
    }),

  suggestions: publicProcedure
    .input(suggestionInputSchema.optional())
    .query(async ({ input }) => {
      const args = suggestionInputSchema.parse(input ?? {});
      const all = await prisma.recipe.findMany({
        include: { ingredients: { include: { ingredient: true } } },
      });
      const pool = all.map(toDTO);

      if (args.type === "search" && !(args.search ?? "").trim()) {
        return [];
      }

      return buildSuggestions(pool, {
        kind: args.type,
        limit: args.limit,
        exclude: args.excludeIds,
        search: args.search,
      });
    }),

  saveWeekPlan: publicProcedure
    .input(WeekPlanInput)
    .mutation(async ({ input }) => {
      const { weekStart, recipeIdsByDay } = input;
      if (recipeIdsByDay.length !== 7) {
        throw new Error("recipeIdsByDay must have length 7");
      }

      const weekStartDate = new Date(weekStart);
      const plan = await prisma.weekPlan.upsert({
        where: { weekStart: weekStartDate },
        update: {},
        create: { weekStart: weekStartDate },
      });

      for (let i = 0 as DayIndex; i < 7; i = (i + 1) as DayIndex) {
        const recipeId = recipeIdsByDay[i];
        await prisma.weekPlanEntry.upsert({
          where: { weekPlanId_dayIndex: { weekPlanId: plan.id, dayIndex: i } },
          update: { recipeId },
          create: { weekPlanId: plan.id, dayIndex: i, recipeId },
        });
      }

      await Promise.all(
        recipeIdsByDay.map((id) =>
          prisma.recipe.update({
            where: { id },
            data: { usageCount: { increment: 1 }, lastUsed: new Date() },
          })
        )
      );

      const full = await prisma.weekPlan.findUnique({
        where: { id: plan.id },
        include: {
          entries: {
            include: { recipe: true },
            orderBy: { dayIndex: "asc" },
          },
        },
      });

      return full;
    }),
});
