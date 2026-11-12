import express, { type Express, type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMealsApi, type MealsApi } from "./api.js";
import { isAllowedHost, type ServerConfig } from "./config.js";
import { verifyAccessToken } from "./oauth/jwt.js";
import { registerOAuthRoutes } from "./oauth/routes.js";
import { buildServer } from "./server.js";

const methodNotAllowedResponse = {
  jsonrpc: "2.0",
  error: { code: -32000, message: "Method not allowed." },
  id: null,
};

const unauthorizedResponse = {
  jsonrpc: "2.0",
  error: { code: -32001, message: "Unauthorized." },
  id: null,
};

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== "string") return null;
  const spaceIndex = header.indexOf(" ");
  if (spaceIndex === -1) return null;
  if (header.slice(0, spaceIndex).toLowerCase() !== "bearer") return null;
  const token = header.slice(spaceIndex + 1).trim();
  return token || null;
}

/** How long a user's role is trusted before it is looked up again. */
const ROLE_CACHE_TTL_MS = 60_000;

export interface AppOptions {
  config: ServerConfig;
  /** Override how the API client is built (tests). */
  createApi?: (userId: string) => MealsApi;
  now?: () => Date;
  log?: (line: string) => void;
}

export function createApp(options: AppOptions): Express {
  const { config } = options;
  const log = options.log ?? ((line: string) => console.log(line));
  const createApi =
    options.createApi ??
    ((userId: string) =>
      createMealsApi({
        apiOrigin: config.mealsApiOrigin,
        apiKey: config.mcpApiKey,
        userId,
      }));

  // The server is stateless: every POST builds a fresh McpServer, including
  // for `tools/list`. Which tools exist depends on the user's role, so cache
  // it briefly instead of asking the API on every single request.
  const roleCache = new Map<string, { isAdmin: boolean; expires: number }>();
  const resolveIsAdmin = async (userId: string, api: MealsApi) => {
    // With the switch off nobody gets the admin tools, so there is no role
    // to look up.
    if (!config.adminToolsEnabled) return false;
    const cached = roleCache.get(userId);
    if (cached && cached.expires > Date.now()) return cached.isAdmin;
    try {
      const { role } = await api.admin.myRole.query();
      const isAdmin = role === "ADMIN";
      roleCache.set(userId, {
        isAdmin,
        expires: Date.now() + ROLE_CACHE_TTL_MS,
      });
      return isAdmin;
    } catch (error) {
      // Leaving the admin tools out is the safe failure; the API would
      // reject the calls anyway. Not cached, so the next request retries.
      console.error("Could not resolve MCP user role:", error);
      return false;
    }
  };

  // Build the Express app ourselves rather than using
  // `createMcpExpressApp` from the MCP SDK. The SDK helper mounts its own
  // body parser, which conflicts with the JSON/urlencoded parsers we need
  // for /oauth/register and /oauth/token — the second parser sees an
  // already-consumed request stream and throws "stream is not readable",
  // surfacing as a 500 on DCR. Mounting the parsers ourselves first means
  // every route gets a freshly parsed body.
  const app = express();

  if (config.allowedHosts.length > 0) {
    // DNS rebinding protection.
    app.use((req, res, next) => {
      const host = typeof req.headers.host === "string" ? req.headers.host : "";
      if (!isAllowedHost(config.allowedHosts, host)) {
        res.status(421).json({ error: "Misdirected request" });
        return;
      }
      next();
    });
  }

  // Body parsing for both /mcp (JSON-RPC payload) and the OAuth endpoints
  // (/oauth/register is JSON, /oauth/token is x-www-form-urlencoded per
  // RFC 6749, though many clients send JSON there too — both are accepted).
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));

  registerOAuthRoutes(app, config.oauth);

  const resourceMetadata = `${config.oauth.issuer}/.well-known/oauth-protected-resource`;

  app.post("/mcp", async (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (!token) {
      res
        .status(401)
        .setHeader(
          "WWW-Authenticate",
          `Bearer resource_metadata="${resourceMetadata}"`,
        )
        .json(unauthorizedResponse);
      return;
    }
    const claims = verifyAccessToken(
      token,
      config.oauth.signingSecret,
      config.oauth.issuer,
      config.oauth.issuer,
    );
    if (!claims) {
      res
        .status(401)
        .setHeader(
          "WWW-Authenticate",
          `Bearer error="invalid_token", resource_metadata="${resourceMetadata}"`,
        )
        .json(unauthorizedResponse);
      return;
    }

    try {
      const userId = claims.sub;
      const api = createApi(userId);
      const server = buildServer({
        api,
        adminTools: await resolveIsAdmin(userId, api),
        timeZone: config.timeZone,
        now: options.now,
        onToolCall: (event) => {
          log(
            `tool=${event.tool} user=${userId} ok=${event.ok} ms=${event.durationMs}` +
              (event.error ? ` error=${JSON.stringify(event.error)}` : ""),
          );
        },
      });
      // Stateless, and answered with a plain JSON body rather than an SSE
      // stream: no tool here streams progress, and a single JSON response
      // cannot be buffered or cut short by the proxies in front of us.
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  // No server-initiated streams and no sessions to end, so only POST exists.
  const methodNotAllowed = (_req: Request, res: Response) => {
    res.status(405).setHeader("Allow", "POST").json(methodNotAllowedResponse);
  };
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  return app;
}
