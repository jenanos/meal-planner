import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";

function userMessage(text: string) {
  return {
    messages: [
      { role: "user" as const, content: { type: "text" as const, text } },
    ],
  };
}

/**
 * Ready-made starting points for the workflows the apps are built around.
 * Clients that support MCP prompts surface these as slash commands or
 * suggestions; they only orchestrate the tools and add no capabilities.
 */
export function registerPrompts(server: McpServer) {
  server.registerPrompt(
    "planlegg-uka",
    {
      title: "Planlegg uka",
      description:
        "Sett opp middagsplanen for en uke, med hensyn til fryseren og hva dere har spist nylig.",
      argsSchema: {
        uke: z
          .string()
          .optional()
          .describe(
            'Hvilken uke: "current", "next" eller en dato (YYYY-MM-DD). Standard: next.',
          ),
        onsker: z
          .string()
          .optional()
          .describe(
            "Ønsker for uka, f.eks. «fisk to ganger, noe raskt på tirsdag».",
          ),
      },
    },
    ({ uke, onsker }) =>
      userMessage(
        [
          `Hjelp meg å planlegge middagene for uka "${uke || "next"}".`,
          "1. Hent konteksten (get-context), ukas nåværende plan (get-week-plan) og fryserbeholdningen (list-freezer).",
          "2. Foreslå en plan for de dagene som er tomme. Bruk suggest-recipes og list-recipes, prioriter det som snart går ut i fryseren, og unngå retter vi nettopp har hatt.",
          onsker
            ? `3. Ta hensyn til disse ønskene: ${onsker}`
            : "3. Spør om jeg har spesielle ønsker hvis noe er uklart.",
          "4. Vis forslaget og vent på at jeg godkjenner før du lagrer med set-week-plan-days.",
          "5. Oppsummer til slutt hva som havner på handlelisten.",
        ].join("\n"),
      ),
  );

  server.registerPrompt(
    "handleliste",
    {
      title: "Gå gjennom handlelisten",
      description:
        "Få en ryddig handleliste for uka, gruppert etter butikkens rekkefølge.",
      argsSchema: {
        uke: z
          .string()
          .optional()
          .describe(
            'Hvilken uke: "current", "next" eller en dato. Standard: current.',
          ),
      },
    },
    ({ uke }) =>
      userMessage(
        [
          `Vis meg handlelisten for uka "${uke || "current"}".`,
          "Hent den med get-shopping-list (onlyUnchecked: true) og butikkrekkefølgen med get-shopping-settings.",
          "Grupper varene etter kategori i standardbutikkens rekkefølge, med mengde og enhet. Sett basisvarer i en egen gruppe til slutt, siden vi ofte har dem hjemme.",
          "Spør etterpå om det er noe jeg vil legge til, eller noe jeg allerede har som skal krysses av.",
        ].join("\n"),
      ),
  );

  server.registerPrompt(
    "rydd-i-varer",
    {
      title: "Rydd i ingredienser og varer",
      description:
        "Finn ingredienser og ekstra varer som mangler enhet eller kategori, og mulige duplikater.",
    },
    () =>
      userMessage(
        [
          "Hjelp meg å rydde i ingrediensene og ekstra-katalogen.",
          "1. Finn ingredienser uten enhet og uten kategori (list-ingredients med filter), og ekstra varer uten kategori (list-extra-catalog med onlyUncategorized).",
          "2. Foreslå enhet og kategori for hver, og vis forslagene samlet før du lagrer med bulk-update-ingredients og set-extra-catalog-categories.",
          "3. Finn mulige duplikater (find-duplicate-ingredients og find-duplicate-extra-items). Vis hver gruppe og hvilken du vil beholde.",
          "Sammenslåing kan ikke angres, så vent på at jeg bekrefter hver gruppe før du bruker merge-verktøyene.",
        ].join("\n"),
      ),
  );
}
