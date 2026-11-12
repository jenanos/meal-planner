import { Category } from "@repo/api";
import * as z from "zod";
import type { MealsApi } from "../api.js";
import {
  ToolError,
  compact,
  defineTool,
  matchByName,
  normalizeName,
  toDateOnly,
  type ToolContext,
} from "./helpers.js";

// ─── Shared recipe helpers ─────────────────────────────────────────────

type RecipeLike = {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  everydayScore: number;
  healthScore: number;
  lastUsed?: unknown;
  usageCount: number;
  ingredients?: Array<{
    ingredientId: string;
    name: string;
    unit?: string | null;
    quantity?: number | null;
    notes?: string | null;
  }>;
};

/** Just enough to recognise a recipe in a list or a week plan. */
export function recipeRef(recipe: RecipeLike) {
  return { id: recipe.id, name: recipe.name, category: recipe.category };
}

export function recipeSummary(
  recipe: RecipeLike,
  options: { ingredients?: boolean } = {},
) {
  return compact({
    id: recipe.id,
    name: recipe.name,
    category: recipe.category,
    everydayScore: recipe.everydayScore,
    healthScore: recipe.healthScore,
    usageCount: recipe.usageCount,
    lastUsed: toDateOnly(recipe.lastUsed) ?? undefined,
    description: options.ingredients
      ? (recipe.description ?? undefined)
      : undefined,
    ingredients: options.ingredients
      ? (recipe.ingredients ?? []).map((ingredient) =>
          compact({
            ingredientId: ingredient.ingredientId,
            name: ingredient.name,
            quantity: ingredient.quantity ?? undefined,
            unit: ingredient.unit ?? undefined,
            notes: ingredient.notes ?? undefined,
          }),
        )
      : undefined,
  });
}

export const recipeRefArgs = {
  recipeId: z
    .string()
    .uuid()
    .optional()
    .describe("Oppskriftens ID. Oppgi enten denne eller recipeName."),
  recipeName: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Oppskriftens navn (uavhengig av store/små bokstaver). Brukes når ID ikke er kjent.",
    ),
};

const RESOLVE_PAGE_SIZE = 200;
/** Far beyond any real recipe collection; only bounds the loop. */
const RESOLVE_MAX_PAGES = 25;

/**
 * Turn "recipeId or recipeName" into an ID. Names are looked up through the
 * recipe search so the model does not have to list recipes first; an
 * ambiguous name is rejected with the candidates rather than guessed.
 */
export async function resolveRecipeId(
  api: MealsApi,
  ref: { recipeId?: string; recipeName?: string },
): Promise<string> {
  if (ref.recipeId) return ref.recipeId;
  const name = ref.recipeName?.trim();
  if (!name) {
    throw new ToolError("Oppgi enten recipeId eller recipeName.");
  }
  // The search is a substring match ordered by creation date, so the recipe
  // that is actually meant can sit behind any number of newer partial
  // matches. Read every page before deciding the name is unknown or
  // ambiguous; an exact match ends the search early.
  const wanted = normalizeName(name);
  const found: Awaited<ReturnType<typeof api.recipe.list.query>>["items"] = [];
  for (let page = 1; page <= RESOLVE_MAX_PAGES; page++) {
    const result = await api.recipe.list.query({
      search: name,
      page,
      pageSize: RESOLVE_PAGE_SIZE,
    });
    const exact = result.items.find(
      (recipe) => normalizeName(recipe.name) === wanted,
    );
    if (exact) return exact.id;
    found.push(...result.items);
    if (result.items.length === 0 || found.length >= result.total) break;
  }
  const { match, candidates } = matchByName(found, name);
  if (match) return match.id;
  if (candidates.length === 0) {
    throw new ToolError(
      `Fant ingen oppskrift som heter "${name}". Bruk list-recipes for å søke.`,
    );
  }
  throw new ToolError(
    `Flere oppskrifter passer til "${name}". Velg én og bruk recipeId.`,
    { candidates: candidates.slice(0, 20).map(recipeRef) },
  );
}

const ingredientLine = z.object({
  name: z.string().min(1).describe("Ingrediensnavn."),
  quantity: z
    .union([z.number(), z.string()])
    .optional()
    .describe("Mengde, f.eks. 2 eller 0.5."),
  unit: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Enhet (stk, g, dl ...). Brukes bare når ingrediensen er ny – enheten hører til ingrediensen, ikke oppskriften.",
    ),
  notes: z.string().min(1).optional().describe("Merknad, f.eks. «finhakket»."),
});

type IngredientLine = z.infer<typeof ingredientLine>;

/**
 * Ingredients are matched by exact name when a recipe is saved, so "løk"
 * would silently create a second ingredient next to "Løk". Map each line
 * onto the existing spelling first, and report which ones really are new.
 */
async function canonicalizeIngredients(
  api: MealsApi,
  lines: IngredientLine[],
): Promise<{ lines: IngredientLine[]; newIngredients: string[] }> {
  if (lines.length === 0) return { lines, newIngredients: [] };
  const existing = await api.ingredient.list.query();
  const byName = new Map(
    existing.map((ingredient) => [
      normalizeName(ingredient.name),
      ingredient.name,
    ]),
  );
  const newIngredients: string[] = [];
  const canonical = lines.map((line) => {
    const known = byName.get(normalizeName(line.name));
    if (known) return { ...line, name: known };
    const name = line.name.trim();
    newIngredients.push(name);
    // Later lines in the same recipe should reuse this spelling too.
    byName.set(normalizeName(name), name);
    return { ...line, name };
  });
  return { lines: canonical, newIngredients: [...new Set(newIngredients)] };
}

const scoreHelp = {
  everyday:
    "Hverdagsscore 1–5: 1 = skikkelig hverdagsmat, 3 = vanlig, 5 = helgemat.",
  health: "Helsescore 1–5: 1 = ikke så sunt, 3 = middels, 5 = veldig sunn.",
};

// ─── Tools ─────────────────────────────────────────────────────────────

export function registerRecipeTools(ctx: ToolContext) {
  const { api } = ctx;

  defineTool(
    ctx,
    "list-recipes",
    {
      title: "List oppskrifter",
      description:
        "Lister oppskrifter, nyeste først, med valgfritt navnesøk og kategorifilter. " +
        "Returnerer et sammendrag per oppskrift; sett includeIngredients for å få med ingredienser og beskrivelse. " +
        "Oppskrifter er felles for alle husholdninger.",
      kind: "read",
      errorContext: "Kunne ikke hente oppskrifter",
      input: {
        search: z.string().optional().describe("Søk i oppskriftsnavn."),
        category: Category.optional().describe("Filtrer på kategori."),
        page: z.number().int().min(1).optional().describe("Side (standard 1)."),
        pageSize: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Antall per side (standard 50)."),
        includeIngredients: z
          .boolean()
          .optional()
          .describe("Ta med ingredienser og beskrivelse (standard false)."),
      },
    },
    async ({ search, category, page, pageSize, includeIngredients }) => {
      const result = await api.recipe.list.query({
        search,
        category,
        page: page ?? 1,
        pageSize: pageSize ?? 50,
      });
      return {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        hasMore: result.page * result.pageSize < result.total,
        recipes: result.items.map((recipe) =>
          recipeSummary(recipe, { ingredients: includeIngredients }),
        ),
      };
    },
  );

  defineTool(
    ctx,
    "get-recipe",
    {
      title: "Hent oppskrift",
      description:
        "Henter én oppskrift med beskrivelse og ingredienser, ut fra ID eller navn.",
      kind: "read",
      errorContext: "Kunne ikke hente oppskrift",
      input: recipeRefArgs,
    },
    async (ref) => {
      const id = await resolveRecipeId(api, ref);
      const recipe = await api.recipe.getById.query({ id });
      return { recipe: recipeSummary(recipe, { ingredients: true }) };
    },
  );

  defineTool(
    ctx,
    "create-recipe",
    {
      title: "Opprett oppskrift",
      description:
        "Oppretter en ny oppskrift. Ingredienser kobles til eksisterende ingredienser med samme navn " +
        "(uavhengig av store/små bokstaver); ukjente ingredienser opprettes og listes i newIngredients.",
      kind: "add",
      errorContext: "Kunne ikke opprette oppskrift",
      input: {
        name: z.string().min(1).describe("Navn på oppskriften."),
        description: z
          .string()
          .optional()
          .describe("Fremgangsmåte eller beskrivelse."),
        category: Category.describe("Hovedkategori."),
        everydayScore: z
          .number()
          .int()
          .min(1)
          .max(5)
          .describe(scoreHelp.everyday),
        healthScore: z.number().int().min(1).max(5).describe(scoreHelp.health),
        ingredients: z
          .array(ingredientLine)
          .optional()
          .describe("Ingredienslinjer."),
      },
    },
    async ({ ingredients, ...fields }) => {
      const resolved = await canonicalizeIngredients(api, ingredients ?? []);
      const recipe = await api.recipe.create.mutate({
        ...fields,
        ingredients: resolved.lines,
      });
      return {
        recipe: recipeSummary(recipe, { ingredients: true }),
        newIngredients: resolved.newIngredients,
      };
    },
  );

  defineTool(
    ctx,
    "update-recipe",
    {
      title: "Oppdater oppskrift",
      description:
        "Oppdaterer en oppskrift. Bare feltene du oppgir endres. " +
        "VIKTIG: 'ingredients' erstatter HELE ingredienslisten – hent oppskriften med get-recipe først " +
        "og send hele den nye listen, eller utelat feltet for å la ingrediensene stå.",
      kind: "destructive",
      errorContext: "Kunne ikke oppdatere oppskrift",
      input: {
        ...recipeRefArgs,
        name: z.string().min(1).optional().describe("Nytt navn."),
        description: z.string().min(1).optional().describe("Ny beskrivelse."),
        category: Category.optional().describe("Ny kategori."),
        everydayScore: z
          .number()
          .int()
          .min(1)
          .max(5)
          .optional()
          .describe(scoreHelp.everyday),
        healthScore: z
          .number()
          .int()
          .min(1)
          .max(5)
          .optional()
          .describe(scoreHelp.health),
        ingredients: z
          .array(ingredientLine)
          .optional()
          .describe("Ny, komplett ingrediensliste (erstatter den gamle)."),
      },
    },
    async ({ recipeId, recipeName, ingredients, ...fields }) => {
      const id = await resolveRecipeId(api, { recipeId, recipeName });
      const resolved =
        ingredients === undefined
          ? null
          : await canonicalizeIngredients(api, ingredients);
      const recipe = await api.recipe.update.mutate({
        id,
        ...fields,
        ...(resolved ? { ingredients: resolved.lines } : {}),
      });
      return {
        recipe: recipeSummary(recipe, { ingredients: true }),
        newIngredients: resolved?.newIngredients ?? [],
      };
    },
  );

  defineTool(
    ctx,
    "delete-recipe",
    {
      title: "Slett oppskrift",
      description:
        "Sletter en oppskrift permanent for alle husholdninger. Kan ikke angres. " +
        "Oppskriften forsvinner også fra alle ukesplaner og fra fryserbeholdningen.",
      kind: "destructive",
      errorContext: "Kunne ikke slette oppskrift",
      input: recipeRefArgs,
    },
    async (ref) => {
      const id = await resolveRecipeId(api, ref);
      await api.recipe.delete.mutate({ id });
      return { ok: true, deletedRecipeId: id };
    },
  );
}
