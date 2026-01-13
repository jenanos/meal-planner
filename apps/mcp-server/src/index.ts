import type { Request, Response } from "express";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@repo/api";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod";

const plannerConstraintsSchema = z.object({
  fish: z.number().int().min(0).default(2),
  vegetarian: z.number().int().min(0).default(3),
  chicken: z.number().int().min(0).default(1),
  beef: z.number().int().min(0).default(1),
  preferRecentGapDays: z.number().int().min(0).default(21),
});

const weekPlanInputSchema = z.object({
  weekStart: z.string().min(1),
  recipeIdsByDay: z.array(z.string().uuid().nullable()).length(7),
});

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
      inputSchema: {
        weekStart: z.string().min(1).describe("ISO-dato for uke-start (mandag)."),
      },
    },
    async ({ weekStart }): Promise<CallToolResult> => {
      const data = await trpcClient.planner.getWeekPlan.query({ weekStart });
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        structuredContent: data,
      };
    }
  );

  server.registerTool(
    "generate-week-plan",
    {
      title: "Generer ukesplan",
      description: "Genererer en ny ukesplan basert på valgfri startdato og begrensninger.",
      inputSchema: {
        weekStart: z.string().min(1).optional().describe("ISO-dato for uke-start (valgfri)."),
        constraints: plannerConstraintsSchema.optional(),
      },
    },
    async ({ weekStart, constraints }): Promise<CallToolResult> => {
      const input = weekStart || constraints ? { weekStart, constraints } : undefined;
      const data = await trpcClient.planner.generateWeekPlan.mutate(input);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        structuredContent: data,
      };
    }
  );

  server.registerTool(
    "save-week-plan",
    {
      title: "Lagre ukesplan",
      description: "Oppdaterer ukesplanen for en uke med 7 oppføringer.",
      inputSchema: {
        weekStart: weekPlanInputSchema.shape.weekStart.describe("ISO-dato for uke-start (mandag)."),
        recipeIdsByDay: weekPlanInputSchema.shape.recipeIdsByDay,
      },
    },
    async ({ weekStart, recipeIdsByDay }): Promise<CallToolResult> => {
      const data = await trpcClient.planner.saveWeekPlan.mutate({
        weekStart,
        recipeIdsByDay,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        structuredContent: data,
      };
    }
  );

  return server;
};

const app = createMcpExpressApp({ host: "0.0.0.0" });

app.post("/mcp", async (req: Request, res: Response) => {
  const server = buildServer();
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      transport.close();
      server.close();
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
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    })
  );
});

app.delete("/mcp", async (_req: Request, res: Response) => {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    })
  );
});

const port = Number(process.env.PORT ?? 5050);
app.listen(port, (error?: Error) => {
  if (error) {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
  }
  console.log(`Meal Planner MCP server listening on port ${port}`);
  console.log(`Using meals API origin: ${mealsApiOrigin}`);
});
