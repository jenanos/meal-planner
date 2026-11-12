import {
  IngredientCategory,
  ShoppingDisplayStyle,
  ShoppingViewMode,
} from "@repo/api";
import * as z from "zod";
import {
  ToolError,
  defineTool,
  matchByName,
  type ToolContext,
} from "./helpers.js";

const dayIndex = z.number().int().min(0).max(6);

export function registerSettingsTools(ctx: ToolContext) {
  const { api } = ctx;

  defineTool(
    ctx,
    "get-shopping-settings",
    {
      title: "Hent handleliste-innstillinger",
      description:
        "Henter den innloggede brukerens innstillinger for handlelisten i appen (visning, startdag, synlige dager, standardbutikk) " +
        "og husholdningens butikker. En butikk er en rekkefølge på varekategoriene, slik at handlelisten kan sorteres etter hvordan butikken er lagt opp.",
      kind: "read",
      errorContext: "Kunne ikke hente innstillinger",
      input: {},
    },
    async () => {
      const result = await api.planner.shoppingSettings.query();
      return { settings: result.settings, stores: result.stores };
    },
  );

  defineTool(
    ctx,
    "update-shopping-settings",
    {
      title: "Endre handleliste-innstillinger",
      description:
        "Endre brukerens visningsinnstillinger for handlelisten og planleggeren i appen. Bare feltene du oppgir endres. " +
        "Dette påvirker hvordan ting vises i web-appen, ikke hva som står på handlelisten.",
      kind: "set",
      errorContext: "Kunne ikke lagre innstillinger",
      input: {
        defaultViewMode: ShoppingViewMode.optional().describe(
          "Sortering: by-day (per dag), alphabetical eller by-category (etter butikkens kategorirekkefølge).",
        ),
        defaultDisplayStyle: ShoppingDisplayStyle.optional().describe(
          "Listeformat: list eller grid.",
        ),
        startDay: dayIndex
          .optional()
          .describe(
            "Ukedagen handleuka starter på: 0 = mandag ... 6 = søndag.",
          ),
        includeNextWeek: z
          .boolean()
          .optional()
          .describe("Ta med neste uke i handlelisten som standard."),
        showPantryWithIngredients: z
          .boolean()
          .optional()
          .describe("Vis basisvarer sammen med de andre ingrediensene."),
        compactShoppingList: z
          .boolean()
          .optional()
          .describe("Vis handlelisten i kompakt format."),
        plannerTapOpensRecipe: z
          .boolean()
          .optional()
          .describe(
            "I ukeplanleggeren: trykk på en dag åpner oppskriften i stedet for å bytte den.",
          ),
        visibleDayIndices: z
          .array(dayIndex)
          .min(1)
          .max(7)
          .optional()
          .describe("Hvilke ukedager som vises (0 = mandag ... 6 = søndag)."),
        defaultStoreId: z
          .string()
          .uuid()
          .optional()
          .describe("Standardbutikk, som ID."),
        defaultStoreName: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Standardbutikk, som navn (alternativ til defaultStoreId).",
          ),
      },
    },
    async ({ defaultStoreId, defaultStoreName, ...changes }) => {
      // The API replaces the whole preference row, so start from what is stored.
      const current = await api.planner.shoppingSettings.query();

      let storeId = defaultStoreId ?? current.settings.defaultStoreId ?? null;
      if (!defaultStoreId && defaultStoreName) {
        const { match } = matchByName(current.stores, defaultStoreName);
        if (!match) {
          throw new ToolError(
            `Fant ingen butikk som heter "${defaultStoreName}".`,
            { stores: current.stores.map(({ id, name }) => ({ id, name })) },
          );
        }
        storeId = match.id;
      }

      const settings = await api.planner.updateShoppingSettings.mutate({
        // The stored values come back typed as plain strings.
        defaultViewMode: ShoppingViewMode.parse(
          changes.defaultViewMode ?? current.settings.defaultViewMode,
        ),
        defaultDisplayStyle: ShoppingDisplayStyle.parse(
          changes.defaultDisplayStyle ?? current.settings.defaultDisplayStyle,
        ),
        startDay: changes.startDay ?? current.settings.startDay,
        includeNextWeek:
          changes.includeNextWeek ?? current.settings.includeNextWeek,
        showPantryWithIngredients:
          changes.showPantryWithIngredients ??
          current.settings.showPantryWithIngredients,
        // Left undefined when not given; the API then keeps the stored value.
        compactShoppingList: changes.compactShoppingList,
        plannerTapOpensRecipe: changes.plannerTapOpensRecipe,
        visibleDayIndices:
          changes.visibleDayIndices ?? current.settings.visibleDayIndices,
        defaultStoreId: storeId,
      });
      return { settings };
    },
  );

  defineTool(
    ctx,
    "create-shopping-store",
    {
      title: "Opprett butikk",
      description:
        "Oppretter en butikk for husholdningen: et navn og rekkefølgen varekategoriene ligger i når man går gjennom butikken. " +
        "Kategorier som utelates legges til sist i standardrekkefølge. " +
        `Kategorier: ${IngredientCategory.options.join(", ")}.`,
      kind: "add",
      errorContext: "Kunne ikke opprette butikk",
      input: {
        name: z.string().trim().min(1).max(80).describe("Butikkens navn."),
        categoryOrder: z
          .array(IngredientCategory)
          .min(1)
          .describe("Kategoriene i den rekkefølgen de møtes i butikken."),
      },
    },
    async ({ name, categoryOrder }) => {
      const unique = [...new Set(categoryOrder)];
      if (unique.length !== categoryOrder.length) {
        throw new ToolError(
          "categoryOrder kan ikke inneholde samme kategori to ganger.",
        );
      }
      const complete = [
        ...unique,
        ...IngredientCategory.options.filter((c) => !unique.includes(c)),
      ];
      const store = await api.planner.createShoppingStore.mutate({
        name,
        categoryOrder: complete,
      });
      return { store };
    },
  );
}
