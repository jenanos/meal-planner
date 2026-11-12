import * as z from "zod";
import type { MealsApi } from "../api.js";
import {
  WEEKDAYS,
  compact,
  dayIndexOf,
  defineTool,
  matchByName,
  normalizeName,
  resolveWeek,
  toApiWeekStart,
  toDateOnly,
  weekArg,
  type ToolContext,
} from "./helpers.js";

type ShoppingList = Awaited<
  ReturnType<MealsApi["planner"]["shoppingList"]["query"]>
>;

const lookaheadArg = z
  .number()
  .int()
  .min(0)
  .max(4)
  .optional()
  .describe(
    "Antall påfølgende uker som skal slås sammen med uka (0–4). Standard 0 = bare denne uka.",
  );

function fetchShoppingList(
  ctx: ToolContext,
  week: string | undefined,
  lookaheadWeeks: number | undefined,
): Promise<ShoppingList> {
  return ctx.api.planner.shoppingList.query({
    weekStart: toApiWeekStart(resolveWeek(ctx, week)),
    lookaheadWeeks: lookaheadWeeks ?? 0,
  });
}

function formatDay(dateISO: string) {
  const date = toDateOnly(dateISO)!;
  return { date, weekday: WEEKDAYS[dayIndexOf(date)] };
}

export function registerShoppingTools(ctx: ToolContext) {
  const { api } = ctx;

  defineTool(
    ctx,
    "get-shopping-list",
    {
      title: "Hent handleliste",
      description:
        "Henter handlelisten for en uke: ingredienser summert fra ukas planlagte oppskrifter (items), " +
        "pluss ekstra varer husholdningen har lagt til selv (extras). " +
        "Basisvarer (isPantryItem) er ting man vanligvis har hjemme. " +
        "Ekstra varer er ikke knyttet til en bestemt uke – de blir stående til de fjernes.",
      kind: "read",
      errorContext: "Kunne ikke hente handleliste",
      input: {
        week: weekArg,
        lookaheadWeeks: lookaheadArg,
        onlyUnchecked: z
          .boolean()
          .optional()
          .describe("Vis bare det som ikke er krysset av (standard false)."),
        includeDetails: z
          .boolean()
          .optional()
          .describe(
            "Ta med fordeling per dag (occurrences) for hver vare. Trengs bare for å krysse av enkeltdager. Standard false.",
          ),
      },
    },
    async ({ week, lookaheadWeeks, onlyUnchecked, includeDetails }) => {
      const list = await fetchShoppingList(ctx, week, lookaheadWeeks);

      const items = list.items
        .filter((item) => !onlyUnchecked || !item.checked)
        .map((item) =>
          compact({
            ingredientId: item.ingredientId,
            name: item.name,
            quantity: item.totalQuantity ?? undefined,
            unit: item.unit ?? undefined,
            category: item.category,
            checked: item.checked,
            isPantryItem: item.isPantryItem || undefined,
            hasMissingQuantities: item.hasMissingQuantities || undefined,
            recipes: [
              ...new Set(item.details.map((detail) => detail.recipeName)),
            ],
            occurrences: includeDetails
              ? item.occurrences.map((occurrence) =>
                  compact({
                    weekStart: toDateOnly(occurrence.weekStart),
                    dayIndex: occurrence.dayIndex,
                    ...formatDay(occurrence.dateISO),
                    quantity: occurrence.quantity ?? undefined,
                    checked: occurrence.checked,
                  }),
                )
              : undefined,
          }),
        );

      const extras = list.extras
        .filter((extra) => !onlyUnchecked || !extra.checked)
        .map((extra) =>
          compact({
            name: extra.name,
            checked: extra.checked,
            category: extra.category ?? undefined,
          }),
        );

      return {
        weekStart: toDateOnly(list.weekStart),
        includedWeekStarts: list.includedWeekStarts.map((w) => toDateOnly(w)),
        plannedDays: list.plannedDays.map((day) =>
          compact({
            ...formatDay(day.dateISO),
            type: day.entryType,
            recipe: day.recipeName ?? undefined,
          }),
        ),
        summary: {
          items: list.items.length,
          itemsUnchecked: list.items.filter((item) => !item.checked).length,
          extras: list.extras.length,
          extrasUnchecked: list.extras.filter((extra) => !extra.checked).length,
        },
        items,
        extras,
      };
    },
  );

  defineTool(
    ctx,
    "check-shopping-items",
    {
      title: "Kryss av varer på handlelisten",
      description:
        "Krysser av (eller fjerner krysset på) varer på handlelisten ut fra navn. " +
        "Virker både for ingredienser fra ukesplanen og for ekstra varer. " +
        "Navn som ikke finnes på listen returneres i notFound, og navn som passer flere varer i ambiguous.",
      kind: "set",
      errorContext: "Kunne ikke krysse av varer",
      input: {
        names: z
          .array(z.string().min(1))
          .min(1)
          .max(200)
          .describe("Navn på varene, slik de står på handlelisten."),
        checked: z
          .boolean()
          .optional()
          .describe(
            "true = krysset av / kjøpt (standard), false = fjern krysset.",
          ),
        week: weekArg,
        lookaheadWeeks: lookaheadArg,
      },
    },
    async ({ names, checked, week, lookaheadWeeks }) => {
      const state = checked ?? true;
      const list = await fetchShoppingList(ctx, week, lookaheadWeeks);
      const weekStart = list.weekStart;

      // The same ingredient can appear once per unit; a name refers to all
      // of them, so match on the distinct names and fan out afterwards.
      const itemNames = [...new Set(list.items.map((item) => item.name))].map(
        (name) => ({ name }),
      );

      const updated: { name: string; kind: "ingredient" | "extra" }[] = [];
      const notFound: string[] = [];
      const ambiguous: { name: string; candidates: string[] }[] = [];
      const handled = new Set<string>();

      for (const rawName of names) {
        const item = matchByName(itemNames, rawName);
        const extra = matchByName(list.extras, rawName);

        // An exact hit wins. A partial hit only counts when nothing in the
        // other group could be meant instead.
        const isExact = (found: { name: string } | null) =>
          found !== null &&
          normalizeName(found.name) === normalizeName(rawName);
        const itemExact = isExact(item.match);
        const extraExact = isExact(extra.match);
        let useItem = itemExact;
        let useExtra = extraExact;
        if (!itemExact && !extraExact) {
          useItem = item.match !== null && extra.candidates.length === 0;
          useExtra = extra.match !== null && item.candidates.length === 0;
        }

        if (!useItem && !useExtra) {
          const candidates = [
            ...item.candidates.map((c) => c.name),
            ...extra.candidates.map((c) => c.name),
          ];
          if (candidates.length > 0) {
            ambiguous.push({ name: rawName, candidates });
          } else {
            notFound.push(rawName);
          }
          continue;
        }

        if (useItem && item.match) {
          const name = item.match.name;
          if (!handled.has(`item::${name}`)) {
            handled.add(`item::${name}`);
            for (const entry of list.items.filter((i) => i.name === name)) {
              await api.planner.updateShoppingItem.mutate({
                ingredientId: entry.ingredientId,
                unit: entry.unit,
                weeks: entry.weekStarts.length ? entry.weekStarts : [weekStart],
                checked: state,
              });
            }
            updated.push({ name, kind: "ingredient" });
          }
        }

        if (useExtra && extra.match) {
          const name = extra.match.name;
          if (!handled.has(`extra::${name}`)) {
            handled.add(`extra::${name}`);
            await api.planner.extraToggle.mutate({
              weekStart,
              name,
              checked: state,
            });
            updated.push({ name, kind: "extra" });
          }
        }
      }

      return { ok: true, checked: state, updated, notFound, ambiguous };
    },
  );

  defineTool(
    ctx,
    "update-shopping-item",
    {
      title: "Kryss av én ingrediens presist",
      description:
        "Krysser av en ingrediens på handlelisten for bestemte uker eller enkeltdager, ut fra ingredientId. " +
        "Bruk check-shopping-items for vanlig avkryssing på navn; dette verktøyet er for å styre " +
        "nøyaktig hvilke dager som er handlet inn (se occurrences fra get-shopping-list med includeDetails).",
      kind: "set",
      errorContext: "Kunne ikke oppdatere handleliste-element",
      input: {
        ingredientId: z.string().uuid().describe("Ingrediensens ID."),
        unit: z
          .string()
          .nullable()
          .optional()
          .describe(
            "Enheten varen står med på listen (utelat eller null hvis den ikke har enhet).",
          ),
        weeks: z
          .array(z.string())
          .optional()
          .describe(
            "Ukene avkryssingen gjelder, som datoer (YYYY-MM-DD) i hver uke.",
          ),
        occurrences: z
          .array(
            z.object({
              weekStart: z.string().describe("En dato i uka (YYYY-MM-DD)."),
              dayIndex: z
                .number()
                .int()
                .min(0)
                .max(6)
                .describe("0 = mandag ... 6 = søndag."),
            }),
          )
          .optional()
          .describe("Enkeltdager avkryssingen gjelder for."),
        checked: z
          .boolean()
          .describe("true = krysset av, false = ikke krysset av."),
      },
    },
    async ({ ingredientId, unit, weeks, occurrences, checked }) => {
      const hasTarget =
        (weeks?.length ?? 0) > 0 || (occurrences?.length ?? 0) > 0;
      await api.planner.updateShoppingItem.mutate({
        ingredientId,
        unit,
        // Default to the current week so a bare call still does something sensible.
        weeks: hasTarget
          ? weeks?.map((w) => toApiWeekStart(resolveWeek(ctx, w)))
          : [toApiWeekStart(resolveWeek(ctx, undefined))],
        occurrences: occurrences?.map((occurrence) => ({
          weekStart: toApiWeekStart(resolveWeek(ctx, occurrence.weekStart)),
          dayIndex: occurrence.dayIndex,
        })),
        checked,
      });
      return { ok: true, ingredientId, checked };
    },
  );

  defineTool(
    ctx,
    "add-extra-shopping-items",
    {
      title: "Legg ekstra varer på handlelisten",
      description:
        "Legger én eller flere ekstra varer (ting som ikke kommer fra en oppskrift, f.eks. dopapir eller kaffe) på handlelisten. " +
        "Varer som finnes i husholdningens katalog fra før gjenbrukes uavhengig av store/små bokstaver. " +
        "For nye varer returneres lignende katalogvarer i similarInCatalog, slik at duplikater kan oppdages. " +
        "En vare som allerede står på listen blir stående, uten kryss.",
      kind: "set",
      errorContext: "Kunne ikke legge til ekstra varer",
      input: {
        names: z
          .array(z.string().min(1))
          .min(1)
          .max(100)
          .describe("Navn på varene som skal legges til."),
      },
    },
    async ({ names }) => {
      const catalog = await api.planner.extraCatalogList.query();
      const byName = new Map(
        catalog.map((entry) => [normalizeName(entry.name), entry.name]),
      );
      const weekStart = toApiWeekStart(resolveWeek(ctx, undefined));

      const added: {
        name: string;
        source: "catalog" | "new";
        similarInCatalog?: string[];
      }[] = [];
      const seen = new Set<string>();

      for (const rawName of names) {
        const wanted = normalizeName(rawName);
        if (!wanted || seen.has(wanted)) continue;
        seen.add(wanted);

        const existing = byName.get(wanted);
        const name = existing ?? rawName.trim();
        await api.planner.extraToggle.mutate({
          weekStart,
          name,
          checked: false,
        });

        const similar = existing
          ? []
          : catalog
              .map((entry) => entry.name)
              .filter((candidate) => {
                const other = normalizeName(candidate);
                return other.includes(wanted) || wanted.includes(other);
              })
              .slice(0, 5);
        added.push(
          compact({
            name,
            source: existing ? ("catalog" as const) : ("new" as const),
            similarInCatalog: similar.length ? similar : undefined,
          }),
        );
        // Later names in the same call should see this one as a lookalike too.
        if (!existing)
          catalog.push({ id: "", name, usageCount: 0, category: null });
      }

      return { ok: true, count: added.length, added };
    },
  );

  defineTool(
    ctx,
    "remove-extra-shopping-items",
    {
      title: "Fjern ekstra varer fra handlelisten",
      description:
        "Fjerner ekstra varer fra handlelisten ut fra navn. Varene blir liggende i katalogen og kan legges til igjen senere. " +
        "Bruk check-shopping-items i stedet hvis varen bare skal krysses av som kjøpt.",
      kind: "destructive",
      errorContext: "Kunne ikke fjerne ekstra varer",
      input: {
        names: z
          .array(z.string().min(1))
          .min(1)
          .max(100)
          .describe("Navn på varene som skal fjernes."),
      },
    },
    async ({ names }) => {
      const list = await fetchShoppingList(ctx, undefined, 0);
      const removed: string[] = [];
      const notFound: string[] = [];
      for (const rawName of names) {
        const { match } = matchByName(list.extras, rawName);
        if (!match) {
          notFound.push(rawName);
          continue;
        }
        if (removed.includes(match.name)) continue;
        await api.planner.extraRemove.mutate({
          weekStart: list.weekStart,
          name: match.name,
        });
        removed.push(match.name);
      }
      return { ok: true, removed, notFound };
    },
  );
}
