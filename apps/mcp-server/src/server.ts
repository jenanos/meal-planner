import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MealsApi } from "./api.js";
import { registerPrompts } from "./prompts.js";
import { registerAdminTools } from "./tools/admin.js";
import { registerCatalogTools } from "./tools/catalog.js";
import { registerContextTools } from "./tools/context.js";
import { registerFreezerTools } from "./tools/freezer.js";
import type { ToolContext } from "./tools/helpers.js";
import { registerIngredientTools } from "./tools/ingredients.js";
import { registerRecipeTools } from "./tools/recipes.js";
import { registerSettingsTools } from "./tools/settings.js";
import { registerShoppingTools } from "./tools/shopping.js";
import { registerWeekPlanTools } from "./tools/week-plan.js";

export const SERVER_VERSION = "2.0.0";

const INSTRUCTIONS = `Meal Planner er en norsk app for middagsplanlegging og handlelister for en husholdning. Svar brukeren på norsk.

Begreper:
- Uke: starter alltid på mandag. Verktøy med 'week' tar en hvilken som helst dato i uka (YYYY-MM-DD) eller "current" / "next" / "previous". dayIndex 0 = mandag ... 6 = søndag. Kall get-context for dagens dato før du regner på uker.
- Ukesplan: én middag per dag. RECIPE = lag oppskriften, FREEZER = porsjon fra fryseren, TAKEAWAY, EMPTY.
- Handleliste: bygges automatisk av ingrediensene i ukas RECIPE-dager (items), pluss ekstra varer husholdningen legger til selv (extras). Basisvarer er ingredienser man vanligvis har hjemme.
- Fryser: porsjoner av ferdige retter. Å planlegge en FREEZER-dag trekker en porsjon fra beholdningen.
- Handlepakke: en navngitt samling ekstra varer som legges på handlelisten samlet.

Eierskap: ukesplaner, handleliste, ekstra varer, pakker, butikker og fryser tilhører brukerens husholdning. Oppskrifter og ingredienser er felles for alle husholdninger – endringer der synes for alle.

Arbeidsmåte:
- De fleste verktøy tar navn (recipeName, names) i stedet for ID, så du trenger sjelden å slå opp ID-er først.
- Les før du skriver når du erstatter noe: update-recipe og update-shopping-package erstatter hele ingrediens-/varelisten hvis feltet sendes.
- Verktøy som sletter eller slår sammen (delete-*, merge-*, generate-week-plan) kan ikke angres. Bekreft med brukeren først.`;

const ADMIN_INSTRUCTIONS = `
- admin-*-verktøyene styrer brukere, innloggingstilgang og husholdninger på tvers av hele appen. Bruk dem bare når brukeren uttrykkelig ber om det, og bekreft alltid før du fjerner tilgang, endrer roller eller sletter en husholdning (admin-delete-household kan ikke angres).`;

export interface BuildServerOptions {
  api: MealsApi;
  /**
   * Whether to offer the user, allowlist and household administration tools.
   * True only when the server-wide switch is on and the caller is an admin.
   */
  adminTools: boolean;
  timeZone: string;
  /** Identifies the user, so their edits of one record are serialized. */
  lockScope: string;
  now?: () => Date;
  onToolCall?: ToolContext["onToolCall"];
}

export function buildServer(options: BuildServerOptions): McpServer {
  const server = new McpServer(
    {
      name: "meal-planner-mcp",
      title: "Meal Planner",
      version: SERVER_VERSION,
      websiteUrl: "https://github.com/jenanos/meal-planner",
    },
    {
      instructions: options.adminTools
        ? INSTRUCTIONS + ADMIN_INSTRUCTIONS
        : INSTRUCTIONS,
    },
  );

  const ctx: ToolContext = {
    server,
    api: options.api,
    timeZone: options.timeZone,
    now: options.now ?? (() => new Date()),
    lockScope: options.lockScope,
    onToolCall: options.onToolCall,
  };

  registerContextTools(ctx);
  registerWeekPlanTools(ctx);
  registerRecipeTools(ctx);
  registerIngredientTools(ctx);
  registerShoppingTools(ctx);
  registerCatalogTools(ctx);
  registerFreezerTools(ctx);
  registerSettingsTools(ctx);
  if (options.adminTools) registerAdminTools(ctx);

  registerPrompts(server);

  return server;
}
