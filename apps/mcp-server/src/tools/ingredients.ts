import { IngredientCategory } from "@repo/api";
import * as z from "zod";
import {
  ToolError,
  defineTool,
  normalizeName,
  type ToolContext,
} from "./helpers.js";

export const ingredientCategoryHelp = `Gyldige kategorier: ${IngredientCategory.options.join(", ")}.`;

export function registerIngredientTools(ctx: ToolContext) {
  const { api } = ctx;

  defineTool(
    ctx,
    "list-ingredients",
    {
      title: "List ingredienser",
      description:
        "Lister ingredienser alfabetisk med enhet, kategori, basisvare-status og antall oppskrifter de brukes i. " +
        "Bruk 'filter' for å finne ingredienser som trenger opprydding. Ingredienser er felles for alle husholdninger.",
      kind: "read",
      errorContext: "Kunne ikke hente ingredienser",
      input: {
        search: z.string().optional().describe("Søk i ingrediensnavn."),
        filter: z
          .enum(["all", "missing-unit", "missing-category", "pantry", "unused"])
          .optional()
          .describe(
            "missing-unit = uten enhet, missing-category = i oppsamlingskategorien ANNET, " +
              "pantry = basisvarer man vanligvis har hjemme, unused = ikke brukt i noen oppskrift. Standard: all.",
          ),
      },
    },
    async ({ search, filter }) => {
      const all = await api.ingredient.list.query(
        search ? { search } : undefined,
      );
      const ingredients = all.filter((ingredient) => {
        switch (filter) {
          case "missing-unit":
            return !ingredient.unit;
          case "missing-category":
            return ingredient.category === "ANNET";
          case "pantry":
            return ingredient.isPantryItem;
          case "unused":
            return ingredient.usageCount === 0;
          default:
            return true;
        }
      });
      return { count: ingredients.length, ingredients };
    },
  );

  defineTool(
    ctx,
    "get-ingredient",
    {
      title: "Hent ingrediens",
      description: "Henter én ingrediens og hvilke oppskrifter den brukes i.",
      kind: "read",
      errorContext: "Kunne ikke hente ingrediens",
      input: {
        ingredientId: z.string().uuid().describe("Ingrediensens ID."),
      },
    },
    async ({ ingredientId }) => {
      const ingredient = await api.ingredient.getWithRecipes.query({
        id: ingredientId,
      });
      return { ingredient };
    },
  );

  defineTool(
    ctx,
    "create-ingredient",
    {
      title: "Opprett ingrediens",
      description:
        "Oppretter en ny ingrediens. Finnes det allerede en ingrediens med samme navn, returneres den uendret " +
        "(bruk update-ingredient for å endre den). " +
        ingredientCategoryHelp,
      kind: "add",
      errorContext: "Kunne ikke opprette ingrediens",
      input: {
        name: z.string().min(1).describe("Ingrediensnavn."),
        unit: z
          .string()
          .min(1)
          .optional()
          .describe("Enhet, f.eks. stk, g, dl."),
        isPantryItem: z
          .boolean()
          .optional()
          .describe("Basisvare man vanligvis har hjemme (standard false)."),
        category: IngredientCategory.optional().describe(
          "Butikkategori (standard ANNET).",
        ),
      },
    },
    async (input) => {
      // The API upserts by exact name and would reset unit and pantry status
      // on a hit, so look for an existing ingredient first.
      const matches = await api.ingredient.list.query({
        search: input.name.trim(),
      });
      const existing = matches.find(
        (ingredient) =>
          normalizeName(ingredient.name) === normalizeName(input.name),
      );
      if (existing) {
        return { created: false, ingredient: existing };
      }
      const ingredient = await api.ingredient.create.mutate(input);
      return { created: true, ingredient };
    },
  );

  defineTool(
    ctx,
    "update-ingredient",
    {
      title: "Oppdater ingrediens",
      description:
        "Oppdaterer navn, enhet, kategori eller basisvare-status på én ingrediens. Bare feltene du oppgir endres. " +
        "Sett unit til null for å fjerne enheten. " +
        ingredientCategoryHelp,
      kind: "set",
      errorContext: "Kunne ikke oppdatere ingrediens",
      input: {
        ingredientId: z.string().uuid().describe("Ingrediensens ID."),
        name: z.string().min(1).optional().describe("Nytt navn."),
        unit: z
          .string()
          .min(1)
          .nullable()
          .optional()
          .describe("Ny enhet, eller null for å fjerne den."),
        isPantryItem: z.boolean().optional().describe("Basisvare eller ikke."),
        category: IngredientCategory.optional().describe("Ny kategori."),
      },
    },
    async ({ ingredientId, name, unit, isPantryItem, category }) => {
      // The API replaces name and unit wholesale, so merge with what is
      // stored to make this a true partial update.
      const current = await api.ingredient.getWithRecipes.query({
        id: ingredientId,
      });
      const nextUnit = unit === undefined ? current.unit : (unit ?? undefined);
      const ingredient = await api.ingredient.update.mutate({
        id: ingredientId,
        name: name ?? current.name,
        unit: nextUnit,
        isPantryItem,
        category,
      });
      return { ingredient };
    },
  );

  defineTool(
    ctx,
    "bulk-update-ingredients",
    {
      title: "Oppdater flere ingredienser",
      description:
        "Setter enhet, kategori og/eller basisvare-status på mange ingredienser i ett kall. " +
        "Hver oppdatering peker på en ingrediens med ingredientId eller eksakt navn. " +
        "Egnet for opprydding etter list-ingredients med filter. " +
        ingredientCategoryHelp,
      kind: "set",
      errorContext: "Kunne ikke oppdatere ingredienser",
      input: {
        updates: z
          .array(
            z.object({
              ingredientId: z
                .string()
                .uuid()
                .optional()
                .describe("Ingrediensens ID (eller bruk name)."),
              name: z
                .string()
                .min(1)
                .optional()
                .describe("Eksakt ingrediensnavn (eller bruk ingredientId)."),
              unit: z.string().trim().min(1).optional().describe("Ny enhet."),
              category: IngredientCategory.optional().describe("Ny kategori."),
              isPantryItem: z
                .boolean()
                .optional()
                .describe("Basisvare eller ikke."),
            }),
          )
          .min(1)
          .max(500)
          .describe("Oppdateringene som skal gjøres."),
      },
    },
    async ({ updates }) => {
      const needsLookup = updates.some((update) => !update.ingredientId);
      const byName = new Map<string, string>();
      if (needsLookup) {
        for (const ingredient of await api.ingredient.list.query()) {
          byName.set(normalizeName(ingredient.name), ingredient.id);
        }
      }

      const units: { id: string; unit: string }[] = [];
      const categories: {
        id: string;
        category: z.infer<typeof IngredientCategory>;
      }[] = [];
      const pantry: { id: string; isPantryItem: boolean }[] = [];
      const notFound: string[] = [];

      for (const update of updates) {
        const id =
          update.ingredientId ??
          (update.name ? byName.get(normalizeName(update.name)) : undefined);
        if (!id) {
          if (!update.name) {
            throw new ToolError(
              "Hver oppdatering må ha enten ingredientId eller name.",
            );
          }
          notFound.push(update.name);
          continue;
        }
        if (update.unit !== undefined) units.push({ id, unit: update.unit });
        if (update.category !== undefined) {
          categories.push({ id, category: update.category });
        }
        if (update.isPantryItem !== undefined) {
          pantry.push({ id, isPantryItem: update.isPantryItem });
        }
      }

      const [unitResult, categoryResult, pantryResult] = await Promise.all([
        units.length
          ? api.ingredient.bulkUpdateUnits.mutate({ updates: units })
          : null,
        categories.length
          ? api.ingredient.bulkUpdateCategories.mutate({ updates: categories })
          : null,
        pantry.length
          ? api.ingredient.bulkUpdatePantryItems.mutate({ updates: pantry })
          : null,
      ]);

      return {
        ok: true,
        updated: {
          units: unitResult?.count ?? 0,
          categories: categoryResult?.count ?? 0,
          pantry: pantryResult?.count ?? 0,
        },
        requested: {
          units: units.length,
          categories: categories.length,
          pantry: pantry.length,
        },
        notFound,
      };
    },
  );

  defineTool(
    ctx,
    "find-duplicate-ingredients",
    {
      title: "Finn mulige ingrediens-duplikater",
      description:
        "Grupperer ingredienser med like navn (f.eks. «løk» og «løk, gul») som kan være duplikater. " +
        "Gruppene er forslag basert på navnelikhet – vurder hver gruppe før du slår sammen med merge-ingredients.",
      kind: "read",
      errorContext: "Kunne ikke finne mulige duplikater",
      input: {},
    },
    async () => {
      const groups = await api.ingredient.listPotentialDuplicates.query();
      return { count: groups.length, groups };
    },
  );

  defineTool(
    ctx,
    "merge-ingredients",
    {
      title: "Slå sammen ingredienser",
      description:
        "Slår sammen duplikate ingredienser: alle oppskrifter og handlepakker som bruker mergeIds pekes om til keepId, " +
        "og ingrediensene i mergeIds slettes permanent. Kan ikke angres.",
      kind: "destructive",
      errorContext: "Kunne ikke slå sammen ingredienser",
      input: {
        keepId: z.string().uuid().describe("Ingrediensen som skal beholdes."),
        mergeIds: z
          .array(z.string().uuid())
          .min(1)
          .describe("Ingrediensene som skal slås inn i keepId og slettes."),
      },
    },
    async ({ keepId, mergeIds }) => {
      const result = await api.ingredient.merge.mutate({ keepId, mergeIds });
      return { ok: true, ...result };
    },
  );
}
