import type { Request, Response } from "express";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import {
  ExtraItemSuggest,
  ExtraItemUpsert,
  ExtraShoppingRemove,
  ExtraShoppingToggle,
  IngredientById,
  IngredientCreate,
  IngredientListQuery,
  IngredientUpdate,
  PlannerConstraints,
  RecipeCreate,
  RecipeListQuery,
  RecipeUpdate,
  WeekPlanInput,
  type AppRouter,
} from "@repo/api";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod";

const weekStartSchema = WeekPlanInput.shape.weekStart;
const weekDaysSchema = WeekPlanInput.shape.days;

const mealsApiOrigin =
  process.env.MEALS_API_INTERNAL_ORIGIN ??
  process.env.MEALS_API_URL ??
  "http://localhost:4000";

const trpcUrl = new URL("/trpc", mealsApiOrigin).toString();

const trpcClient = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: trpcUrl,
    }),
  ],
});

const methodNotAllowedResponse = {
  jsonrpc: "2.0",
  error: {
    code: -32000,
    message: "Method not allowed.",
  },
  id: null,
};

const formatToolError = (error: unknown, context: string): CallToolResult => {
  const message = error instanceof Error ? error.message : String(error);
  const payload = {
    ok: false,
    error: `${context}: ${message}`,
  };

  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
};

const normalizeName = (name: string) => name.trim().toLowerCase();

const formatSuccess = <T extends Record<string, unknown>>(payload: T): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  structuredContent: payload,
});

const buildServer = () => {
  const server = new McpServer(
    {
      name: "meal-planner-mcp",
      version: "1.0.0",
      websiteUrl: "https://github.com/jenanos/meal-planner",
    },
    { capabilities: { logging: {} } }
  );

  server.registerTool(
    "get-week-plan",
    {
      title: "Hent ukesplan",
      description: "Henter ukesplanen for en gitt uke (mandag som start).",
      inputSchema: z.object({
        weekStart: weekStartSchema.describe("ISO-dato for uke-start (mandag)."),
      }),
    },
    async ({ weekStart }): Promise<CallToolResult> => {
      try {
        const data = await trpcClient.planner.getWeekPlan.query({ weekStart });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          structuredContent: data,
        };
      } catch (error) {
        return formatToolError(error, "Kunne ikke hente ukesplan");
      }
    }
  );

  server.registerTool(
    "generate-week-plan",
    {
      title: "Generer ukesplan",
      description: "Genererer en ny ukesplan basert på valgfri startdato og begrensninger.",
      inputSchema: z.object({
        weekStart: weekStartSchema
          .optional()
          .describe("ISO-dato for uke-start (valgfri)."),
        constraints: PlannerConstraints.optional(),
      }),
    },
    async ({ weekStart, constraints }): Promise<CallToolResult> => {
      try {
        const input = weekStart || constraints ? { weekStart, constraints } : undefined;
        const data = await trpcClient.planner.generateWeekPlan.mutate(input);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          structuredContent: data,
        };
      } catch (error) {
        return formatToolError(error, "Kunne ikke generere ukesplan");
      }
    }
  );

  server.registerTool(
    "save-week-plan",
    {
      title: "Lagre ukesplan",
      description: "Oppdaterer ukesplanen for en uke med 7 oppføringer.",
      inputSchema: z.object({
        weekStart: weekStartSchema.describe("ISO-dato for uke-start (mandag)."),
        days: weekDaysSchema,
      }),
    },
    async ({ weekStart, days }): Promise<CallToolResult> => {
      try {
        const data = await trpcClient.planner.saveWeekPlan.mutate({
          weekStart,
          days,
        });
        return formatSuccess(data);
      } catch (error) {
        return formatToolError(error, "Kunne ikke lagre ukesplan");
      }
    }
  );

  server.registerTool(
    "get-shopping-list",
    {
      title: "Hent handleliste",
      description: "Henter handlelisten for en uke (valgfritt inkludert neste uke).",
      inputSchema: z.object({
        weekStart: z.string().optional().describe("ISO-dato for uke-start (valgfri)."),
        includeNextWeek: z.boolean().optional().describe("Ta med neste uke i handlelisten."),
      }),
    },
    async ({ weekStart, includeNextWeek }): Promise<CallToolResult> => {
      try {
        const data = await trpcClient.planner.shoppingList.query({
          weekStart,
          includeNextWeek,
        });
        return formatSuccess(data);
      } catch (error) {
        return formatToolError(error, "Kunne ikke hente handleliste");
      }
    }
  );

  server.registerTool(
    "update-shopping-item",
    {
      title: "Oppdater handleliste-element",
      description: "Oppdaterer avhuking eller fjerner et handleliste-element for angitte uker/forekomster.",
      inputSchema: z.object({
        ingredientId: z.string().uuid().describe("Ingrediens-ID"),
        unit: z.string().nullable().optional().describe("Enhet (hvis satt på ingrediens)"),
        weeks: z.array(z.string()).optional().describe("Uke-start-datoer (ISO) som skal oppdateres"),
        occurrences: z
          .array(
            z.object({
              weekStart: z.string().describe("Uke-start (ISO)"),
              dayIndex: z.number().int().min(0).max(6).describe("Dagindeks (0=mandag)"),
            })
          )
          .optional(),
        checked: z.boolean().describe("Om elementet er krysset av"),
      }),
    },
    async ({ ingredientId, unit, weeks, occurrences, checked }): Promise<CallToolResult> => {
      try {
        const data = await trpcClient.planner.updateShoppingItem.mutate({
          ingredientId,
          unit,
          weeks,
          occurrences,
          checked,
        });
        return formatSuccess(data);
      } catch (error) {
        return formatToolError(error, "Kunne ikke oppdatere handleliste-element");
      }
    }
  );

  server.registerTool(
    "update-shopping-items-by-name",
    {
      title: "Kryss av handleliste etter navn",
      description:
        "Krysser av handleliste-elementer ved å matche ingrediensnavn mot ukens handleliste.",
      inputSchema: z.object({
        weekStart: z.string().min(1).describe("ISO-dato for uke-start (mandag)."),
        ingredientNames: z
          .array(z.string().min(1))
          .min(1)
          .describe("Liste med ingrediensnavn som skal avhakes"),
        checked: z.boolean().optional().describe("Sett til false for å fjerne avhuking."),
        includeNextWeek: z.boolean().optional().describe("Se også på neste uke ved matching."),
      }),
    },
    async ({ weekStart, ingredientNames, checked, includeNextWeek }): Promise<CallToolResult> => {
      try {
        const shoppingList = await trpcClient.planner.shoppingList.query({
          weekStart,
          includeNextWeek,
        });
        const items = shoppingList.items ?? [];
        const itemsByName = new Map<string, typeof items>();
        for (const item of items) {
          const key = normalizeName(item.name);
          if (!itemsByName.has(key)) {
            itemsByName.set(key, []);
          }
          itemsByName.get(key)!.push(item);
        }

        const includedWeeks =
          shoppingList.includedWeekStarts?.length
            ? shoppingList.includedWeekStarts
            : shoppingList.weekStart
              ? [shoppingList.weekStart]
              : [weekStart];
        const allowedWeeks = new Set(includedWeeks);
        const updates: Array<{ ingredientId: string; name: string; unit: string | null; weekStart: string }> = [];
        const missing: string[] = [];
        const updateKeys = new Set<string>();

        const selectWeek = (itemWeeks: string[]) => {
          if (itemWeeks.includes(weekStart)) return weekStart;
          return itemWeeks.find((week) => allowedWeeks.has(week)) ?? weekStart;
        };

        for (const rawName of ingredientNames) {
          const key = normalizeName(rawName);
          const matched = itemsByName.get(key);
          if (!matched || matched.length === 0) {
            missing.push(rawName);
            continue;
          }
          for (const item of matched) {
            const targetWeek = selectWeek(item.weekStarts ?? []);
            const updateKey = `${item.ingredientId}::${item.unit ?? ""}::${targetWeek}`;
            if (updateKeys.has(updateKey)) continue;
            updateKeys.add(updateKey);
            updates.push({
              ingredientId: item.ingredientId,
              name: item.name,
              unit: item.unit ?? null,
              weekStart: targetWeek,
            });
          }
        }

        await Promise.all(
          updates.map((update) =>
            trpcClient.planner.updateShoppingItem.mutate({
              ingredientId: update.ingredientId,
              unit: update.unit,
              weeks: [update.weekStart],
              checked: checked ?? true,
            })
          )
        );

        return formatSuccess({
          ok: true,
          updated: updates,
          missing,
        });
      } catch (error) {
        return formatToolError(error, "Kunne ikke oppdatere handleliste etter navn");
      }
    }
  );

  server.registerTool(
    "get-ingredients-without-unit",
    {
      title: "Hent ingredienser uten enhet",
      description: "Returnerer alle ingredienser som mangler enhet.",
      inputSchema: z.object({}),
    },
    async (): Promise<CallToolResult> => {
      try {
        const data = await trpcClient.ingredient.listWithoutUnit.query();
        return formatSuccess({ items: data });
      } catch (error) {
        return formatToolError(error, "Kunne ikke hente ingredienser uten enhet");
      }
    }
  );

  server.registerTool(
    "get-potential-duplicate-ingredients",
    {
      title: "Finn potensielle duplikater",
      description: "Returnerer grupper av ingredienser som kan være duplikater basert på navnelikhet.",
      inputSchema: z.object({}),
    },
    async (): Promise<CallToolResult> => {
      try {
        const data = await trpcClient.ingredient.listPotentialDuplicates.query();
        return formatSuccess({ groups: data });
      } catch (error) {
        return formatToolError(error, "Kunne ikke finne potensielle duplikater");
      }
    }
  );

  server.registerTool(
    "bulk-update-ingredient-units",
    {
      title: "Bulk-oppdater ingrediens-enheter",
      description: "Oppdaterer enheter for flere ingredienser på en gang.",
      inputSchema: z.object({
        updates: z.array(z.object({
          id: z.string().uuid().describe("Ingrediens-ID"),
          unit: z.string().min(1).describe("Ny enhet"),
        })).describe("Liste med oppdateringer"),
      }),
    },
    async ({ updates }): Promise<CallToolResult> => {
      try {
        const data = await trpcClient.ingredient.bulkUpdateUnits.mutate({ updates });
        return formatSuccess(data);
      } catch (error) {
        return formatToolError(error, "Kunne ikke oppdatere ingrediens-enheter");
      }
    }
  );

  server.registerTool(
    "list-ingredients",
    {
      title: "List ingredienser",
      description: "Lister ingredienser (valgfritt filtrert på søk).",
      inputSchema: IngredientListQuery.optional(),
    },
    async (input): Promise<CallToolResult> => {
      try {
        const data = await trpcClient.ingredient.list.query(input ?? undefined);
        return formatSuccess({ items: data });
      } catch (error) {
        return formatToolError(error, "Kunne ikke hente ingredienser");
      }
    }
  );

  server.registerTool(
    "create-ingredient",
    {
      title: "Opprett ingrediens",
      description: "Oppretter eller oppdaterer en ingrediens basert på navn.",
      inputSchema: IngredientCreate,
    },
    async (input): Promise<CallToolResult> => {
      try {
        const data = await trpcClient.ingredient.create.mutate(input);
        return formatSuccess(data);
      } catch (error) {
        return formatToolError(error, "Kunne ikke opprette ingrediens");
      }
    }
  );

  server.registerTool(
    "update-ingredient",
    {
      title: "Oppdater ingrediens",
      description: "Oppdaterer navn, enhet eller pantry-status for en ingrediens.",
      inputSchema: IngredientUpdate,
    },
    async (input): Promise<CallToolResult> => {
      try {
        const data = await trpcClient.ingredient.update.mutate(input);
        return formatSuccess(data);
      } catch (error) {
        return formatToolError(error, "Kunne ikke oppdatere ingrediens");
      }
    }
  );

  server.registerTool(
    "get-ingredient-with-recipes",
    {
      title: "Hent ingrediens med oppskrifter",
      description: "Henter detaljer for en ingrediens, inkludert oppskrifter.",
      inputSchema: IngredientById,
    },
    async (input): Promise<CallToolResult> => {
      try {
        const data = await trpcClient.ingredient.getWithRecipes.query(input);
        return formatSuccess(data);
      } catch (error) {
        return formatToolError(error, "Kunne ikke hente ingrediens");
      }
    }
  );

  server.registerTool(
    "list-recipes",
    {
      title: "List oppskrifter",
      description: "Lister oppskrifter med paginering og valgfritt søk.",
      inputSchema: RecipeListQuery.optional(),
    },
    async (input): Promise<CallToolResult> => {
      try {
        const data = await trpcClient.recipe.list.query(input ?? {});
        return formatSuccess(data);
      } catch (error) {
        return formatToolError(error, "Kunne ikke hente oppskrifter");
      }
    }
  );

  server.registerTool(
    "get-recipe",
    {
      title: "Hent oppskrift",
      description: "Henter en oppskrift basert på ID.",
      inputSchema: z.object({ id: z.string().uuid() }),
    },
    async (input): Promise<CallToolResult> => {
      try {
        const data = await trpcClient.recipe.getById.query(input);
        return formatSuccess(data);
      } catch (error) {
        return formatToolError(error, "Kunne ikke hente oppskrift");
      }
    }
  );

  server.registerTool(
    "create-recipe",
    {
      title: "Opprett oppskrift",
      description: "Oppretter en ny oppskrift og tilknyttede ingredienser.",
      inputSchema: RecipeCreate,
    },
    async (input): Promise<CallToolResult> => {
      try {
        const data = await trpcClient.recipe.create.mutate(input);
        return formatSuccess(data);
      } catch (error) {
        return formatToolError(error, "Kunne ikke opprette oppskrift");
      }
    }
  );

  server.registerTool(
    "update-recipe",
    {
      title: "Oppdater oppskrift",
      description: "Oppdaterer en eksisterende oppskrift og ingredienser.",
      inputSchema: RecipeUpdate,
    },
    async (input): Promise<CallToolResult> => {
      try {
        const data = await trpcClient.recipe.update.mutate(input);
        return formatSuccess(data);
      } catch (error) {
        return formatToolError(error, "Kunne ikke oppdatere oppskrift");
      }
    }
  );

  server.registerTool(
    "delete-recipe",
    {
      title: "Slett oppskrift",
      description: "Sletter en oppskrift basert på ID.",
      inputSchema: z.object({ id: z.string().uuid() }),
    },
    async (input): Promise<CallToolResult> => {
      try {
        const data = await trpcClient.recipe.delete.mutate(input);
        return formatSuccess(data);
      } catch (error) {
        return formatToolError(error, "Kunne ikke slette oppskrift");
      }
    }
  );

  server.registerTool(
    "suggest-extra-shopping-items",
    {
      title: "Foreslå ekstra handleliste-elementer",
      description: "Foreslår lagrede ekstra-elementer basert på søk.",
      inputSchema: ExtraItemSuggest.optional(),
    },
    async (input): Promise<CallToolResult> => {
      try {
        const data = await trpcClient.planner.extraSuggest.query(input ?? undefined);
        return formatSuccess({ items: data });
      } catch (error) {
        return formatToolError(error, "Kunne ikke foreslå ekstra handleliste-elementer");
      }
    }
  );

  server.registerTool(
    "add-extra-shopping-item",
    {
      title: "Legg til ekstra handleliste-element",
      description:
        "Legger til et ekstra element på handlelisten for en uke (oppretter katalogelement hvis nødvendig).",
      inputSchema: ExtraShoppingToggle,
    },
    async (input): Promise<CallToolResult> => {
      try {
        const data = await trpcClient.planner.extraToggle.mutate(input);
        return formatSuccess(data);
      } catch (error) {
        return formatToolError(error, "Kunne ikke legge til ekstra handleliste-element");
      }
    }
  );

  server.registerTool(
    "remove-extra-shopping-item",
    {
      title: "Fjern ekstra handleliste-element",
      description: "Fjerner et ekstra handleliste-element fra en uke.",
      inputSchema: ExtraShoppingRemove,
    },
    async (input): Promise<CallToolResult> => {
      try {
        const data = await trpcClient.planner.extraRemove.mutate(input);
        return formatSuccess(data);
      } catch (error) {
        return formatToolError(error, "Kunne ikke fjerne ekstra handleliste-element");
      }
    }
  );

  server.registerTool(
    "add-extra-item-to-catalog",
    {
      title: "Legg til ekstra-element i katalog",
      description: "Legger til et element i ekstra-handlelistekatalogen uten å legge det på en uke.",
      inputSchema: ExtraItemUpsert,
    },
    async (input): Promise<CallToolResult> => {
      try {
        const data = await trpcClient.planner.extraAdd.mutate(input);
        return formatSuccess(data);
      } catch (error) {
        return formatToolError(error, "Kunne ikke legge til ekstra-element i katalog");
      }
    }
  );

  return server;
};

const mcpServer = buildServer();
const app = createMcpExpressApp({ host: "0.0.0.0" });

app.post("/mcp", async (req: Request, res: Response) => {
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      transport.close();
    });
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

app.get("/mcp", async (_req: Request, res: Response) => {
  res.writeHead(405).end(JSON.stringify(methodNotAllowedResponse));
});

app.delete("/mcp", async (_req: Request, res: Response) => {
  res.writeHead(405).end(JSON.stringify(methodNotAllowedResponse));
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

const port = Number(process.env.PORT ?? 5050);
const httpServer = app.listen(port, (error?: Error) => {
  if (error) {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
  }
  console.log(`Meal Planner MCP server listening on port ${port}`);
  console.log(`Using meals API origin: ${mealsApiOrigin}`);
});

const gracefulShutdown = (signal: string) => {
  console.log(`Received ${signal}, shutting down gracefully...`);
  
  // Force exit after 10 seconds if graceful shutdown hangs
  const forceExitTimer = setTimeout(() => {
    console.error("Forcefully shutting down after timeout");
    process.exit(1);
  }, 10000);
  
  httpServer.close(() => {
    clearTimeout(forceExitTimer);
    console.log("Server closed");
    process.exit(0);
  });
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
