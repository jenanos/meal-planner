import * as z from "zod";
import type { MealsApi } from "../api.js";
import {
  ToolError,
  WEEKDAYS,
  addDays,
  compact,
  defineTool,
  resolveWeek,
  toApiWeekStart,
  toDateOnly,
  weekArg,
  type ToolContext,
} from "./helpers.js";
import { recipeRef, recipeSummary, resolveRecipeId } from "./recipes.js";

type WeekPlan = Awaited<
  ReturnType<MealsApi["planner"]["getWeekPlan"]["query"]>
>;
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

/** A recipe-backed change must say which recipe; the API needs the ID. */
type ApiChange =
  | { dayIndex: number; type: "RECIPE" | "FREEZER"; recipeId: string }
  | { dayIndex: number; type: "TAKEAWAY" | "EMPTY" };

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
      kind: "destructive",
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

      const resolved: ApiChange[] = [];
      for (const change of changes) {
        if (change.type === "RECIPE" || change.type === "FREEZER") {
          if (!change.recipeId && !change.recipeName) {
            throw new ToolError(
              `${WEEKDAYS[change.dayIndex]}: ${change.type} krever recipeId eller recipeName.`,
            );
          }
          resolved.push({
            dayIndex: change.dayIndex,
            type: change.type,
            recipeId: await resolveRecipeId(api, change),
          });
        } else {
          resolved.push({ dayIndex: change.dayIndex, type: change.type });
        }
      }

      // One API call: the days and the freezer portions that follow from
      // them change together or not at all, and the API merges the change
      // into the week as it is at that moment rather than a copy read here.
      const saved = await api.planner.setWeekPlanDays.mutate({
        weekStart: toApiWeekStart(monday),
        changes: resolved,
        syncFreezer: syncFreezer ?? true,
      });

      return { ...formatWeek(saved), freezerChanges: saved.freezerChanges };
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
      idempotent: false,
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
      const hasConstraints = [fish, vegetarian, chicken, beef].some(
        (value) => value !== undefined,
      );
      const generated = await api.planner.generateWeekPlan.mutate({
        weekStart: toApiWeekStart(resolveWeek(ctx, week)),
        seed,
        // A generated week never contains freezer meals, so any that were
        // planned go back into the freezer, in the same transaction.
        syncFreezer: syncFreezer ?? true,
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

      return {
        ...formatWeek(generated),
        freezerChanges: generated.freezerChanges,
      };
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
