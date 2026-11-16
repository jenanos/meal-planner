import * as z from "zod";
import { compact, defineTool, todayIn, type ToolContext } from "./helpers.js";

const dateOnly = (what: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Dato må skrives som YYYY-MM-DD")
    .describe(what);

/**
 * Store offers ("tilbud") on the shopping list. The server does not read
 * the stores' flyers itself: an assistant with web access finds the offers
 * and reports them here, typically from a weekly scheduled job.
 */
export function registerDealTools(ctx: ToolContext) {
  const { api } = ctx;

  defineTool(
    ctx,
    "get-deal-watchlist",
    {
      title: "Hent tilbudsvarsler",
      description:
        "Utgangspunktet for tilbudsjakt: varene husholdningen vil ha beskjed om når de er på tilbud (watchlist, med ønsker om merke, størrelse eller pris i note), " +
        "tilbudene som allerede står på handlelisten (activeDeals), husholdningens butikker og dagens dato. " +
        "Selve tilbudene må du finne selv i butikkenes tilbudsaviser (nettsøk) – serveren henter dem ikke.",
      kind: "read",
      errorContext: "Kunne ikke hente tilbudsvarsler",
      input: {},
    },
    async () => {
      const [watchlist, deals, settings] = await Promise.all([
        api.deal.watchList.query(),
        api.deal.list.query(),
        api.planner.shoppingSettings.query(),
      ]);
      return {
        today: todayIn(ctx.timeZone, ctx.now()),
        watchlist: watchlist.map((item) =>
          compact({ name: item.name, note: item.note ?? undefined }),
        ),
        activeDeals: deals.map((deal) =>
          compact({
            name: deal.name,
            store: deal.store,
            price: deal.price,
            regularPrice: deal.regularPrice ?? undefined,
            product: deal.product ?? undefined,
            validFrom: deal.validFrom ?? undefined,
            validTo: deal.validTo,
            bought: deal.checked || undefined,
          }),
        ),
        stores: settings.stores.map((store) => store.name),
      };
    },
  );

  defineTool(
    ctx,
    "set-deal-watch-items",
    {
      title: "Følg med på tilbud for varer",
      description:
        "Legger varer til i tilbudsvarslene, eller endrer notatet på varer som står der fra før. " +
        "Bruk generelle varenavn («Kaffe», «Gulost») og legg ønsker i note, f.eks. «Evergood eller Friele, under 45 kr for 250 g».",
      kind: "set",
      errorContext: "Kunne ikke lagre tilbudsvarsler",
      input: {
        items: z
          .array(
            z.object({
              name: z.string().min(1).max(120).describe("Varenavn."),
              note: z
                .string()
                .max(300)
                .nullable()
                .optional()
                .describe(
                  "Ønsker om merke, størrelse eller hva som regnes som en god pris. Utelat for å beholde notatet, null for å fjerne det.",
                ),
            }),
          )
          .min(1)
          .max(100),
      },
    },
    async ({ items }) => {
      const { saved } = await api.deal.watchSet.mutate({ items });
      return {
        ok: true,
        watchlist: saved.map((item) =>
          compact({ name: item.name, note: item.note ?? undefined }),
        ),
      };
    },
  );

  defineTool(
    ctx,
    "remove-deal-watch-items",
    {
      title: "Slutt å følge med på tilbud for varer",
      description:
        "Fjerner varer fra tilbudsvarslene. Tilbud som allerede står på handlelisten blir stående.",
      kind: "destructive",
      errorContext: "Kunne ikke fjerne tilbudsvarsler",
      input: {
        names: z
          .array(z.string().min(1))
          .min(1)
          .max(100)
          .describe("Varenavn slik de står i tilbudsvarslene."),
      },
    },
    async ({ names }) => {
      const result = await api.deal.watchRemove.mutate({ names });
      return { ok: true, ...result };
    },
  );

  defineTool(
    ctx,
    "add-shopping-deals",
    {
      title: "Legg tilbud på handlelisten",
      description:
        "Legger gode butikktilbud på handlelisten, merket med butikk, tilbudspris og periode. " +
        "Står varen ikke på listen, legges den til; står den der fra før, får den tilbudsmerket. Én vare har ett tilbud – et nytt erstatter det gamle, så velg det beste. " +
        "Tilbud forsvinner av seg selv når perioden er over, sammen med varer som bare sto der på grunn av tilbudet. " +
        "Trygt å kjøre flere ganger: et tilbud som allerede er handlet (krysset av) legges ikke tilbake. " +
        "Bruk det generelle varenavnet fra tilbudsvarslene eller handlelisten i name («Kaffe»), og det konkrete produktet i product.",
      kind: "set",
      errorContext: "Kunne ikke legge til tilbud",
      input: {
        deals: z
          .array(
            z.object({
              name: z
                .string()
                .min(1)
                .max(120)
                .describe("Varen på handlelisten, f.eks. «Kaffe»."),
              store: z
                .string()
                .min(1)
                .max(80)
                .describe("Butikken eller kjeden, f.eks. «Kiwi»."),
              price: z
                .string()
                .min(1)
                .max(80)
                .describe(
                  "Tilbudsprisen slik den annonseres, f.eks. «39,90 kr», «2 for 70 kr» eller «-40 %».",
                ),
              regularPrice: z
                .string()
                .max(80)
                .optional()
                .describe("Ordinær pris, hvis kjent, f.eks. «64,90 kr»."),
              product: z
                .string()
                .max(200)
                .optional()
                .describe(
                  "Det konkrete produktet, f.eks. «Evergood filtermalt 250 g».",
                ),
              validFrom: dateOnly(
                "Første dag tilbudet gjelder (YYYY-MM-DD).",
              ).optional(),
              validTo: dateOnly("Siste dag tilbudet gjelder (YYYY-MM-DD)."),
            }),
          )
          .min(1)
          .max(50),
      },
    },
    async ({ deals }) => {
      const { saved, skipped } = await api.deal.set.mutate({ deals });
      return compact({
        ok: true,
        // added = ny på listen, attached/updated = sto der fra før,
        // alreadyBought = samme tilbud er allerede krysset av.
        saved,
        skipped: skipped.length
          ? skipped.map((entry) => ({
              name: entry.name,
              reason: "Tilbudsperioden er allerede over.",
            }))
          : undefined,
      });
    },
  );

  defineTool(
    ctx,
    "remove-shopping-deals",
    {
      title: "Fjern tilbud fra handlelisten",
      description:
        "Fjerner tilbudsmerket fra varer på handlelisten, f.eks. når et tilbud viste seg å være feil. " +
        "Varer som bare sto på listen på grunn av tilbudet fjernes også (itemRemoved); varer som sto der fra før blir stående uten merke.",
      kind: "destructive",
      errorContext: "Kunne ikke fjerne tilbud",
      input: {
        names: z
          .array(z.string().min(1))
          .min(1)
          .max(100)
          .describe("Varenavn slik de står på handlelisten."),
      },
    },
    async ({ names }) => {
      const result = await api.deal.remove.mutate({ names });
      return { ok: true, ...result };
    },
  );
}
