import { IngredientCategory } from "@repo/api";
import * as z from "zod";
import type { MealsApi } from "../api.js";
import {
  ToolError,
  defineTool,
  matchByName,
  normalizeName,
  resolveWeek,
  toApiWeekStart,
  weekArg,
  type ToolContext,
} from "./helpers.js";
import { ingredientCategoryHelp } from "./ingredients.js";

const packageRefArgs = {
  packageId: z
    .string()
    .uuid()
    .optional()
    .describe("Pakkens ID. Oppgi enten denne eller packageName."),
  packageName: z
    .string()
    .min(1)
    .optional()
    .describe("Pakkens navn, som alternativ til packageId."),
};

async function resolvePackageId(
  api: MealsApi,
  ref: { packageId?: string; packageName?: string },
): Promise<string> {
  if (ref.packageId) return ref.packageId;
  const name = ref.packageName?.trim();
  if (!name) throw new ToolError("Oppgi enten packageId eller packageName.");
  const packages = await api.planner.packageList.query();
  const { match, candidates } = matchByName(packages, name);
  if (match) return match.id;
  throw new ToolError(
    candidates.length
      ? `Flere pakker passer til "${name}". Velg én og bruk packageId.`
      : `Fant ingen pakke som heter "${name}". Bruk list-shopping-packages for å se pakkene.`,
    { candidates: candidates.map(({ id, name: n }) => ({ id, name: n })) },
  );
}

const packageItem = z.object({
  displayName: z
    .string()
    .trim()
    .min(1)
    .describe("Navnet varen får på handlelisten."),
  ingredientId: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Valgfri kobling til en ingrediens (ikke sammen med extraItemCatalogId).",
    ),
  extraItemCatalogId: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Valgfri kobling til en vare i ekstra-katalogen (ikke sammen med ingredientId).",
    ),
});

export function registerCatalogTools(ctx: ToolContext) {
  const { api } = ctx;

  // ─── Extra item catalog ────────────────────────────────────────────

  defineTool(
    ctx,
    "list-extra-catalog",
    {
      title: "List ekstra-katalogen",
      description:
        "Lister husholdningens katalog over ekstra varer (varer som ikke kommer fra oppskrifter), " +
        "med kategori og hvor mange ganger hver vare har vært på handlelisten. " +
        "Kategorien styrer hvor varen havner når handlelisten sorteres etter butikk.",
      kind: "read",
      errorContext: "Kunne ikke hente ekstra-katalogen",
      input: {
        search: z.string().optional().describe("Søk i varenavn."),
        onlyUncategorized: z
          .boolean()
          .optional()
          .describe("Vis bare varer uten kategori (standard false)."),
      },
    },
    async ({ search, onlyUncategorized }) => {
      const wanted = search ? normalizeName(search) : null;
      const items = (await api.planner.extraCatalogList.query()).filter(
        (item) =>
          (!wanted || normalizeName(item.name).includes(wanted)) &&
          (!onlyUncategorized || item.category === null),
      );
      return { count: items.length, items };
    },
  );

  defineTool(
    ctx,
    "add-extra-catalog-item",
    {
      title: "Legg vare i ekstra-katalogen",
      description:
        "Legger en vare i ekstra-katalogen uten å sette den på handlelisten, valgfritt med kategori. " +
        "Finnes varen fra før, beholdes den (og kategorien oppdateres hvis den er oppgitt). " +
        ingredientCategoryHelp,
      kind: "set",
      errorContext: "Kunne ikke legge til vare i katalogen",
      input: {
        name: z.string().min(1).describe("Varenavn."),
        category: IngredientCategory.optional().describe("Butikkategori."),
      },
    },
    async ({ name, category }) => {
      const item = await api.planner.extraAdd.mutate({ name });
      if (category) {
        await api.planner.extraCatalogBulkUpdateCategories.mutate({
          updates: [{ id: item.id, category }],
        });
      }
      if (category) return { item: { ...item, category } };
      // The item may have existed already; report the category it really has.
      const stored = (await api.planner.extraCatalogList.query()).find(
        (entry) => entry.id === item.id,
      );
      return { item: { ...item, category: stored?.category ?? null } };
    },
  );

  defineTool(
    ctx,
    "set-extra-catalog-categories",
    {
      title: "Sett kategori på ekstra varer",
      description:
        "Setter eller fjerner kategori på én eller flere varer i ekstra-katalogen. " +
        "Hver oppdatering peker på en vare med id eller eksakt navn; category null fjerner kategorien. " +
        ingredientCategoryHelp,
      kind: "set",
      errorContext: "Kunne ikke oppdatere kategorier",
      input: {
        updates: z
          .array(
            z.object({
              id: z
                .string()
                .uuid()
                .optional()
                .describe("Katalogvarens ID (eller bruk name)."),
              name: z
                .string()
                .min(1)
                .optional()
                .describe("Eksakt varenavn (eller bruk id)."),
              category: IngredientCategory.nullable().describe(
                "Ny kategori, eller null for ingen.",
              ),
            }),
          )
          .min(1)
          .max(500)
          .describe("Oppdateringene som skal gjøres."),
      },
    },
    async ({ updates }) => {
      const byName = new Map<string, string>();
      if (updates.some((update) => !update.id)) {
        for (const item of await api.planner.extraCatalogList.query()) {
          byName.set(normalizeName(item.name), item.id);
        }
      }
      const resolved: {
        id: string;
        category: z.infer<typeof IngredientCategory> | null;
      }[] = [];
      const notFound: string[] = [];
      for (const update of updates) {
        const id =
          update.id ??
          (update.name ? byName.get(normalizeName(update.name)) : undefined);
        if (!id) {
          if (!update.name) {
            throw new ToolError("Hver oppdatering må ha enten id eller name.");
          }
          notFound.push(update.name);
          continue;
        }
        resolved.push({ id, category: update.category });
      }
      const result = resolved.length
        ? await api.planner.extraCatalogBulkUpdateCategories.mutate({
            updates: resolved,
          })
        : { count: 0 };
      return {
        ok: true,
        updated: result.count,
        requested: resolved.length,
        notFound,
      };
    },
  );

  defineTool(
    ctx,
    "find-duplicate-extra-items",
    {
      title: "Finn mulige duplikater i ekstra-katalogen",
      description:
        "Grupperer varer i ekstra-katalogen med like navn som kan være duplikater. " +
        "Gruppene er forslag – vurder hver gruppe før du slår sammen med merge-extra-catalog-items.",
      kind: "read",
      errorContext: "Kunne ikke finne mulige duplikater",
      input: {},
    },
    async () => {
      const groups =
        await api.planner.extraCatalogListPotentialDuplicates.query();
      return { count: groups.length, groups };
    },
  );

  defineTool(
    ctx,
    "merge-extra-catalog-items",
    {
      title: "Slå sammen varer i ekstra-katalogen",
      description:
        "Slår sammen duplikate katalogvarer: handleliste-oppføringer og pakker som bruker mergeIds pekes om til keepId, " +
        "og varene i mergeIds slettes permanent. Kan ikke angres.",
      kind: "destructive",
      errorContext: "Kunne ikke slå sammen varer",
      input: {
        keepId: z.string().uuid().describe("Katalogvaren som skal beholdes."),
        mergeIds: z
          .array(z.string().uuid())
          .min(1)
          .describe("Katalogvarene som skal slås inn i keepId og slettes."),
      },
    },
    async ({ keepId, mergeIds }) => {
      const result = await api.planner.extraCatalogMerge.mutate({
        keepId,
        mergeIds,
      });
      return { ok: true, ...result };
    },
  );

  // ─── Shopping packages ─────────────────────────────────────────────

  defineTool(
    ctx,
    "list-shopping-packages",
    {
      title: "List handlepakker",
      description:
        "Lister husholdningens handlepakker med innhold. En pakke er en navngitt samling varer " +
        "(f.eks. «Tacokveld» eller «Storhandel basis») som kan legges på handlelisten i ett grep.",
      kind: "read",
      errorContext: "Kunne ikke hente handlepakker",
      input: {
        search: z.string().optional().describe("Søk i pakkenavn."),
      },
    },
    async ({ search }) => {
      const wanted = search ? normalizeName(search) : null;
      const packages = (await api.planner.packageList.query()).filter(
        (pkg) => !wanted || normalizeName(pkg.name).includes(wanted),
      );
      return { count: packages.length, packages };
    },
  );

  defineTool(
    ctx,
    "create-shopping-package",
    {
      title: "Opprett handlepakke",
      description: "Oppretter en ny handlepakke med et navn og en liste varer.",
      kind: "add",
      errorContext: "Kunne ikke opprette handlepakke",
      input: {
        name: z.string().trim().min(1).describe("Navn på pakken."),
        items: z.array(packageItem).describe("Varene i pakken."),
      },
    },
    async ({ name, items }) => {
      const created = await api.planner.packageCreate.mutate({ name, items });
      return { package: created };
    },
  );

  defineTool(
    ctx,
    "update-shopping-package",
    {
      title: "Oppdater handlepakke",
      description:
        "Gir en handlepakke nytt navn og/eller nytt innhold. " +
        "VIKTIG: 'items' erstatter HELE innholdet i pakken – send den komplette listen, eller utelat feltet.",
      kind: "destructive",
      errorContext: "Kunne ikke oppdatere handlepakke",
      input: {
        ...packageRefArgs,
        name: z.string().trim().min(1).optional().describe("Nytt navn."),
        items: z
          .array(packageItem)
          .optional()
          .describe("Nytt, komplett innhold (erstatter det gamle)."),
      },
    },
    async ({ packageId, packageName, name, items }) => {
      const id = await resolvePackageId(api, { packageId, packageName });
      await api.planner.packageUpdate.mutate({ id, name, items });
      const updated = await api.planner.packageGet.query({ id });
      return { package: updated };
    },
  );

  defineTool(
    ctx,
    "delete-shopping-package",
    {
      title: "Slett handlepakke",
      description:
        "Sletter en handlepakke permanent. Varer som allerede er lagt på handlelisten fra pakken blir stående.",
      kind: "destructive",
      errorContext: "Kunne ikke slette handlepakke",
      input: packageRefArgs,
    },
    async (ref) => {
      const id = await resolvePackageId(api, ref);
      await api.planner.packageDelete.mutate({ id });
      return { ok: true, deletedPackageId: id };
    },
  );

  defineTool(
    ctx,
    "add-shopping-package-to-list",
    {
      title: "Legg handlepakke på handlelisten",
      description:
        "Legger alle varene i en handlepakke på handlelisten som ekstra varer, uten kryss.",
      kind: "set",
      errorContext: "Kunne ikke legge pakken på handlelisten",
      input: { ...packageRefArgs, week: weekArg },
    },
    async ({ packageId, packageName, week }) => {
      const id = await resolvePackageId(api, { packageId, packageName });
      const result = await api.planner.packageExpand.mutate({
        packageId: id,
        weekStart: toApiWeekStart(resolveWeek(ctx, week)),
      });
      return { ok: true, added: result.addedNames };
    },
  );
}
