import * as z from "zod";
import type { MealsApi } from "../api.js";
import {
  ToolError,
  WEEKDAYS,
  addDays,
  compact,
  defineTool,
  resolveWeek,
  serialize,
  toApiWeekStart,
  toDateOnly,
  weekArg,
  type ToolContext,
} from "./helpers.js";
import { recipeRef, recipeSummary, resolveRecipeId } from "./recipes.js";

type WeekPlan = Awaited<
  ReturnType<MealsApi["planner"]["getWeekPlan"]["query"]>
>;
type EntryType = "RECIPE" | "TAKEAWAY" | "FREEZER" | "EMPTY";
type DayInput =
  | { type: "RECIPE"; recipeId: string }
  | { type: "FREEZER"; recipeId: string }
  | { type: "TAKEAWAY" }
  | { type: "EMPTY" };

const entryTypeHelp =
  "RECIPE = lag oppskriften (ingrediensene havner på handlelisten), " +
  "FREEZER = ta en porsjon av oppskriften fra fryseren (ingen ingredienser på handlelisten), " +
  "TAKEAWAY = takeaway/spise ute, EMPTY = tom dag.";

function formatWeek(
  plan: WeekPlan,
  options: { ingredients?: boolean; suggestions?: boolean } = {},
) {
  const monday = toDateOnly(plan.weekStart)!;
  return compact({
    weekStart: monday,
    weekEnd: addDays(monday, 6),
    updatedAt: plan.updatedAt,
    days: plan.days.map((day) =>
      compact({
        dayIndex: day.dayIndex,
        weekday: WEEKDAYS[day.dayIndex],
        date: addDays(monday, day.dayIndex),
        type: day.entryType,
        recipe: day.recipe
          ? options.ingredients
            ? recipeSummary(day.recipe, { ingredients: true })
            : recipeRef(day.recipe)
          : undefined,
      }),
    ),
    suggestions: options.suggestions
      ? {
          longGap: plan.suggestions.longGap.map((r) => recipeSummary(r)),
          frequent: plan.suggestions.frequent.map((r) => recipeSummary(r)),
        }
      : undefined,
  });
}

/** Fetch a week, refusing weeks the API would silently clamp to its horizon. */
async function fetchWeek(api: MealsApi, monday: string): Promise<WeekPlan> {
  const plan = await api.planner.getWeekPlan.query({
    weekStart: toApiWeekStart(monday),
  });
  const actual = toDateOnly(plan.weekStart);
  if (actual !== monday) {
    throw new ToolError(
      `Uka som starter ${monday} ligger utenfor planleggingshorisonten. Seneste uke som kan planlegges starter ${actual}.`,
    );
  }
  return plan;
}

function toDayInputs(plan: WeekPlan): DayInput[] {
  return plan.days.map((day): DayInput => {
    if (day.entryType === "RECIPE" && day.recipe) {
      return { type: "RECIPE", recipeId: day.recipe.id };
    }
    if (day.entryType === "FREEZER" && day.recipe) {
      return { type: "FREEZER", recipeId: day.recipe.id };
    }
    if (day.entryType === "TAKEAWAY") return { type: "TAKEAWAY" };
    return { type: "EMPTY" };
  });
}

function freezerCounts(days: DayInput[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const day of days) {
    if (day.type !== "FREEZER") continue;
    counts.set(day.recipeId, (counts.get(day.recipeId) ?? 0) + 1);
  }
  return counts;
}

/**
 * How the freezer inventory has to move when a week changes from `before`
 * to `after`: planning a freezer meal takes a portion out, removing one puts
 * it back. Mirrors what the web planner does on each drag and drop.
 */
function freezerDeltas(before: DayInput[], after: DayInput[]) {
  const prev = freezerCounts(before);
  const next = freezerCounts(after);
  const deltas: { recipeId: string; portions: number }[] = [];
  for (const recipeId of new Set([...prev.keys(), ...next.keys()])) {
    // Negative = portions taken out of the freezer.
    const portions = (prev.get(recipeId) ?? 0) - (next.get(recipeId) ?? 0);
    if (portions !== 0) deltas.push({ recipeId, portions });
  }
  return deltas;
}

async function assertFreezerStock(
  api: MealsApi,
  deltas: { recipeId: string; portions: number }[],
) {
  const withdrawals = deltas.filter((delta) => delta.portions < 0);
  if (withdrawals.length === 0) return;
  const inventory = await api.freezer.list.query();
  const stock = new Map(
    inventory.map((item) => [item.recipeId, item.quantity]),
  );
  const short = withdrawals
    .filter((delta) => (stock.get(delta.recipeId) ?? 0) < -delta.portions)
    .map((delta) => ({
      recipeId: delta.recipeId,
      needed: -delta.portions,
      inFreezer: stock.get(delta.recipeId) ?? 0,
    }));
  if (short.length > 0) {
    throw new ToolError(
      "Det er ikke nok porsjoner i fryseren til planen. Bruk list-freezer for å se beholdningen, " +
        "eller sett syncFreezer til false for å planlegge uten å røre fryseren.",
      { insufficientFreezerStock: short },
    );
  }
}

async function applyFreezerDeltas(
  api: MealsApi,
  deltas: { recipeId: string; portions: number }[],
) {
  // One at a time: the API adjusts by a single portion per call, and
  // concurrent adjustments of the same recipe would race.
  for (const delta of deltas) {
    for (let i = 0; i < Math.abs(delta.portions); i++) {
      if (delta.portions < 0) {
        await api.freezer.decrement.mutate({ recipeId: delta.recipeId });
      } else {
        await api.freezer.increment.mutate({ recipeId: delta.recipeId });
      }
    }
  }
}

/**
 * Changing a week is read, modify, write the whole week, followed by the
 * matching freezer adjustments. Everything a user does to one week therefore
 * runs in sequence, so parallel edits of different days all survive and the
 * freezer is adjusted against the plan that was actually saved.
 */
const weekLockKey = (ctx: ToolContext, monday: string) =>
  `week-plan:${ctx.lockScope}:${monday}`;

const syncFreezerArg = z
  .boolean()
  .optional()
  .describe(
    "Hold fryserbeholdningen i takt med planen: FREEZER-dager som legges til trekker en porsjon, de som fjernes legger den tilbake. Standard true.",
  );

export function registerWeekPlanTools(ctx: ToolContext) {
  const { api } = ctx;

  defineTool(
    ctx,
    "get-week-plan",
    {
      title: "Hent ukesplan",
      description:
        "Henter middagsplanen for en uke: sju dager (dayIndex 0 = mandag) med type og oppskrift. " +
        entryTypeHelp,
      kind: "read",
      errorContext: "Kunne ikke hente ukesplan",
      input: {
        week: weekArg,
        includeIngredients: z
          .boolean()
          .optional()
          .describe(
            "Ta med ingredienser og beskrivelse for hver oppskrift (standard false).",
          ),
        includeSuggestions: z
          .boolean()
          .optional()
          .describe(
            "Ta med forslag til oppskrifter (lenge siden sist / ofte brukt). Standard false.",
          ),
      },
    },
    async ({ week, includeIngredients, includeSuggestions }) => {
      const requested = resolveWeek(ctx, week);
      const plan = await api.planner.getWeekPlan.query({
        weekStart: toApiWeekStart(requested),
      });
      const formatted = formatWeek(plan, {
        ingredients: includeIngredients,
        suggestions: includeSuggestions,
      });
      // The API answers with the last plannable week when asked for one
      // further ahead; say so rather than pass it off as the requested week.
      return formatted.weekStart === requested
        ? formatted
        : {
            note: `Uka som starter ${requested} ligger utenfor planleggingshorisonten. Viser seneste uke som kan planlegges.`,
            ...formatted,
          };
    },
  );

  defineTool(
    ctx,
    "list-weeks",
    {
      title: "List uker",
      description:
        "Viser ukene rundt en gitt uke (fire bakover og opptil fire fremover) og om de har en plan. " +
        "Nyttig for å se hvilke uker som mangler plan og hvor langt frem det går an å planlegge.",
      kind: "read",
      errorContext: "Kunne ikke hente ukeoversikt",
      input: { week: weekArg },
    },
    async ({ week }) => {
      const timeline = await api.planner.weekTimeline.query({
        around: toApiWeekStart(resolveWeek(ctx, week)),
      });
      return {
        aroundWeekStart: toDateOnly(timeline.currentWeekStart),
        weeks: timeline.weeks.map((entry) => ({
          weekStart: toDateOnly(entry.weekStart),
          weekEnd: toDateOnly(entry.weekEnd),
          hasPlan: entry.hasEntries,
          updatedAt: entry.updatedAt,
        })),
      };
    },
  );

  defineTool(
    ctx,
    "set-week-plan-days",
    {
      title: "Endre dager i ukesplanen",
      description:
        "Setter én eller flere dager i en ukesplan og lar resten av uka stå urørt. " +
        "Send sju endringer for å erstatte hele uka. " +
        entryTypeHelp +
        " Oppskrifter kan angis med ID eller navn.",
      kind: "set",
      errorContext: "Kunne ikke endre ukesplan",
      input: {
        week: weekArg,
        changes: z
          .array(
            z.object({
              dayIndex: z
                .number()
                .int()
                .min(0)
                .max(6)
                .describe("Dag i uka: 0 = mandag ... 6 = søndag."),
              type: z
                .enum(["RECIPE", "FREEZER", "TAKEAWAY", "EMPTY"])
                .describe("Hva dagen skal inneholde."),
              recipeId: z
                .string()
                .uuid()
                .optional()
                .describe("Oppskrift-ID (for RECIPE og FREEZER)."),
              recipeName: z
                .string()
                .min(1)
                .optional()
                .describe("Oppskriftsnavn, som alternativ til recipeId."),
            }),
          )
          .min(1)
          .max(7)
          .describe("Dagene som skal endres."),
        syncFreezer: syncFreezerArg,
      },
    },
    async ({ week, changes, syncFreezer }) => {
      const monday = resolveWeek(ctx, week);
      return serialize(weekLockKey(ctx, monday), async () => {
        const seen = new Set<number>();
        for (const change of changes) {
          if (seen.has(change.dayIndex)) {
            throw new ToolError(
              `dayIndex ${change.dayIndex} er oppgitt flere ganger.`,
            );
          }
          seen.add(change.dayIndex);
        }

        const before = toDayInputs(await fetchWeek(api, monday));
        const after = [...before];
        for (const change of changes) {
          const type: EntryType = change.type;
          if (type === "RECIPE" || type === "FREEZER") {
            if (!change.recipeId && !change.recipeName) {
              throw new ToolError(
                `${WEEKDAYS[change.dayIndex]}: ${type} krever recipeId eller recipeName.`,
              );
            }
            after[change.dayIndex] = {
              type,
              recipeId: await resolveRecipeId(api, change),
            };
          } else {
            after[change.dayIndex] = { type };
          }
        }

        const deltas =
          syncFreezer === false ? [] : freezerDeltas(before, after);
        await assertFreezerStock(api, deltas);

        const saved = await api.planner.saveWeekPlan.mutate({
          weekStart: toApiWeekStart(monday),
          days: after,
        });
        await applyFreezerDeltas(api, deltas);

        return { ...formatWeek(saved), freezerChanges: deltas };
      });
    },
  );

  defineTool(
    ctx,
    "generate-week-plan",
    {
      title: "Generer ukesplan",
      description:
        "Lar appen foreslå og lagre en hel uke med oppskrifter, spredt slik at de samme rettene ikke går igjen for ofte. " +
        "ERSTATTER alle sju dagene i uka, også dager som allerede er planlagt. " +
        "Kall verktøyet på nytt for et annet forslag, og finjuster enkeltdager med set-week-plan-days.",
      kind: "destructive",
      errorContext: "Kunne ikke generere ukesplan",
      input: {
        week: weekArg,
        fish: z
          .number()
          .int()
          .min(0)
          .max(7)
          .optional()
          .describe("Antall fiskemiddager (standard 2)."),
        vegetarian: z
          .number()
          .int()
          .min(0)
          .max(7)
          .optional()
          .describe("Antall vegetarmiddager (standard 1)."),
        chicken: z
          .number()
          .int()
          .min(0)
          .max(7)
          .optional()
          .describe("Antall kyllingmiddager (standard 1)."),
        beef: z
          .number()
          .int()
          .min(0)
          .max(7)
          .optional()
          .describe("Antall storfemiddager (standard 1)."),
        seed: z
          .string()
          .max(64)
          .optional()
          .describe(
            "Valgfri verdi som gir samme forslag hver gang. Utelat for et nytt forslag.",
          ),
        syncFreezer: syncFreezerArg,
      },
    },
    async ({ week, fish, vegetarian, chicken, beef, seed, syncFreezer }) => {
      const monday = resolveWeek(ctx, week);
      return serialize(weekLockKey(ctx, monday), async () => {
        const before = toDayInputs(await fetchWeek(api, monday));

        const hasConstraints = [fish, vegetarian, chicken, beef].some(
          (value) => value !== undefined,
        );
        const generated = await api.planner.generateWeekPlan.mutate({
          weekStart: toApiWeekStart(monday),
          seed,
          // Spell out every field: the API schema would otherwise fill gaps
          // with defaults that differ from the ones the app itself uses.
          constraints: hasConstraints
            ? {
                fish: fish ?? 2,
                vegetarian: vegetarian ?? 1,
                chicken: chicken ?? 1,
                beef: beef ?? 1,
                preferRecentGapDays: 21,
              }
            : undefined,
        });

        // A generated week never contains freezer meals, so any that were
        // planned go back into the freezer.
        const deltas =
          syncFreezer === false
            ? []
            : freezerDeltas(before, toDayInputs(generated));
        await applyFreezerDeltas(api, deltas);

        return { ...formatWeek(generated), freezerChanges: deltas };
      });
    },
  );

  defineTool(
    ctx,
    "suggest-recipes",
    {
      title: "Foreslå oppskrifter",
      description:
        "Foreslår oppskrifter til planleggingen: de det er lengst siden sist dere spiste (longGap), " +
        "eller de som brukes oftest (frequent).",
      kind: "read",
      errorContext: "Kunne ikke hente forslag",
      input: {
        type: z
          .enum(["longGap", "frequent"])
          .optional()
          .describe(
            "longGap = lengst siden sist (standard), frequent = oftest brukt.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe("Antall forslag (standard 6)."),
        excludeRecipeIds: z
          .array(z.string().uuid())
          .optional()
          .describe(
            "Oppskrifter som skal holdes utenfor, f.eks. de som allerede er i planen.",
          ),
      },
    },
    async ({ type, limit, excludeRecipeIds }) => {
      const recipes = await api.planner.suggestions.query({
        type: type ?? "longGap",
        limit: limit ?? 6,
        excludeIds: excludeRecipeIds ?? [],
      });
      return {
        type: type ?? "longGap",
        recipes: recipes.map((recipe) => recipeSummary(recipe)),
      };
    },
  );
}
