import { Category, IngredientCategory } from "@repo/api";
import {
  WEEKDAYS,
  addDays,
  dayIndexOf,
  defineTool,
  mondayOf,
  todayIn,
  type ToolContext,
} from "./helpers.js";

export function registerContextTools(ctx: ToolContext) {
  defineTool(
    ctx,
    "get-context",
    {
      title: "Hent kontekst",
      description:
        "Gir utgangspunktet for alt annet: dagens dato og ukedag, hvilken uke som er inneværende og neste, " +
        "hvem som er innlogget (med rolle) og hvilken husholdning dataene gjelder. " +
        "Kall dette først når en forespørsel handler om «i dag», «denne uka» eller «neste uke».",
      kind: "read",
      errorContext: "Kunne ikke hente kontekst",
      input: {},
    },
    async () => {
      const today = todayIn(ctx.timeZone, ctx.now());
      const currentWeekStart = mondayOf(today);
      const identity = await ctx.api.admin.whoAmI.query();
      return {
        today,
        weekday: WEEKDAYS[dayIndexOf(today)],
        todayDayIndex: dayIndexOf(today),
        timeZone: ctx.timeZone,
        currentWeekStart,
        nextWeekStart: addDays(currentWeekStart, 7),
        user: identity.user,
        household: identity.household,
        isAdmin: identity.user.role === "ADMIN",
        recipeCategories: Category.options,
        ingredientCategories: IngredientCategory.options,
      };
    },
  );
}
