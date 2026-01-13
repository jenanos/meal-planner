import type { Request, Response } from "express";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import { PlannerConstraints, WeekPlanInput, type AppRouter } from "@repo/api";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod";

const weekStartSchema = WeekPlanInput.shape.weekStart;
const recipeIdsByDaySchema = WeekPlanInput.shape.recipeIdsByDay;

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
        recipeIdsByDay: recipeIdsByDaySchema,
      }),
    },
    async ({ weekStart, recipeIdsByDay }): Promise<CallToolResult> => {
      try {
        const data = await trpcClient.planner.saveWeekPlan.mutate({
          weekStart,
          recipeIdsByDay,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          structuredContent: data,
        };
      } catch (error) {
        return formatToolError(error, "Kunne ikke lagre ukesplan");
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
