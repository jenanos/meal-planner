import * as z from "zod";
import {
  ToolError,
  defineTool,
  toApiDateTime,
  toDateOnly,
  todayIn,
  type ToolContext,
} from "./helpers.js";
import { recipeRefArgs, resolveRecipeId } from "./recipes.js";

type FreezerItem = {
  recipeId: string;
  recipeName: string;
  recipeCategory: string;
  quantity: number;
  frozenAt: string;
  expiresAt: string;
};

export function registerFreezerTools(ctx: ToolContext) {
  const { api } = ctx;

  const format = (item: FreezerItem) => {
    const today = todayIn(ctx.timeZone, ctx.now());
    const expiresAt = toDateOnly(item.expiresAt)!;
    const daysUntilExpiry = Math.round(
      (Date.parse(expiresAt) - Date.parse(today)) / 86_400_000,
    );
    return {
      recipeId: item.recipeId,
      recipeName: item.recipeName,
      category: item.recipeCategory,
      portions: item.quantity,
      frozenAt: toDateOnly(item.frozenAt),
      expiresAt,
      daysUntilExpiry,
      expired: daysUntilExpiry < 0,
    };
  };

  defineTool(
    ctx,
    "list-freezer",
    {
      title: "Vis fryserbeholdning",
      description:
        "Viser hva husholdningen har i fryseren: porsjoner per oppskrift, når de ble fryst og når de bør brukes innen. " +
        "Porsjoner herfra kan planlegges som FREEZER-dager med set-week-plan-days.",
      kind: "read",
      errorContext: "Kunne ikke hente fryserbeholdning",
      input: {},
    },
    async () => {
      const items = (await api.freezer.list.query()).map(format);
      return {
        count: items.length,
        totalPortions: items.reduce((sum, item) => sum + item.portions, 0),
        items,
      };
    },
  );

  defineTool(
    ctx,
    "set-freezer-item",
    {
      title: "Sett fryserbeholdning for en oppskrift",
      description:
        "Setter antall porsjoner av en oppskrift i fryseren, og/eller datoene for innfrysing og holdbarhet. " +
        "portions 0 fjerner oppskriften fra fryseren. Uten expiresAt beregnes holdbarheten ut fra kategori " +
        "(fisk 2 mnd, vegetar 3, kylling 4, storfe 6). Utelat portions for bare å endre datoer.",
      kind: "destructive",
      errorContext: "Kunne ikke oppdatere fryseren",
      input: {
        ...recipeRefArgs,
        portions: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Nytt antall porsjoner (0 fjerner oppføringen)."),
        frozenAt: z
          .string()
          .optional()
          .describe("Dato for innfrysing (YYYY-MM-DD)."),
        expiresAt: z
          .string()
          .optional()
          .describe("Bør brukes innen (YYYY-MM-DD)."),
      },
    },
    async ({ recipeId, recipeName, portions, frozenAt, expiresAt }) => {
      if (portions === undefined && !frozenAt && !expiresAt) {
        throw new ToolError("Oppgi portions, frozenAt eller expiresAt.");
      }
      const id = await resolveRecipeId(api, { recipeId, recipeName });
      const dates = {
        frozenAt: frozenAt ? toApiDateTime(frozenAt) : undefined,
        expiresAt: expiresAt ? toApiDateTime(expiresAt) : undefined,
      };

      if (portions === undefined) {
        const inFreezer = (await api.freezer.list.query()).some(
          (item) => item.recipeId === id,
        );
        if (!inFreezer) {
          throw new ToolError(
            "Oppskriften ligger ikke i fryseren. Oppgi portions for å legge den inn.",
          );
        }
        const item = await api.freezer.updateDates.mutate({
          recipeId: id,
          ...dates,
        });
        return { item: format(item) };
      }

      const item = await api.freezer.upsert.mutate({
        recipeId: id,
        quantity: portions,
        ...dates,
      });
      return item
        ? { item: format(item) }
        : { item: null, removedRecipeId: id };
    },
  );

  defineTool(
    ctx,
    "adjust-freezer-portions",
    {
      title: "Legg til eller ta ut porsjoner fra fryseren",
      description:
        "Øker eller reduserer antall porsjoner av en oppskrift i fryseren. " +
        "Positiv delta legger til (f.eks. etter å ha laget dobbel porsjon), negativ tar ut. " +
        "Når siste porsjon tas ut, forsvinner oppskriften fra fryseren. " +
        "Merk: set-week-plan-days trekker selv fra fryseren når en FREEZER-dag planlegges.",
      kind: "destructive",
      idempotent: false,
      errorContext: "Kunne ikke justere fryseren",
      input: {
        ...recipeRefArgs,
        delta: z
          .number()
          .int()
          .min(-20)
          .max(20)
          .describe(
            "Antall porsjoner å legge til (positivt) eller ta ut (negativt).",
          ),
      },
    },
    async ({ recipeId, recipeName, delta }) => {
      if (delta === 0) throw new ToolError("delta kan ikke være 0.");
      const id = await resolveRecipeId(api, { recipeId, recipeName });

      if (delta < 0) {
        const current =
          (await api.freezer.list.query()).find((item) => item.recipeId === id)
            ?.quantity ?? 0;
        if (current < -delta) {
          throw new ToolError(
            `Kan ikke ta ut ${-delta} porsjoner – det ligger bare ${current} i fryseren.`,
          );
        }
      }

      // The API moves one portion per call; run them in sequence so the
      // adjustments of the same row cannot race.
      let portions = 0;
      for (let i = 0; i < Math.abs(delta); i++) {
        const result =
          delta > 0
            ? await api.freezer.increment.mutate({ recipeId: id })
            : await api.freezer.decrement.mutate({ recipeId: id });
        portions = result?.quantity ?? 0;
      }
      return { ok: true, recipeId: id, portions };
    },
  );
}
