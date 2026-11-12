import { readFileSync, readdirSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { appRouter } from "@repo/api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { signAccessToken } from "../src/oauth/jwt";
import { fakeApi } from "./helpers/mcp";

const ISSUER = "https://mcp.test";
const SECRET = "test-signing-secret";

const BASE_ENV = {
  MCP_OAUTH_ISSUER: ISSUER,
  MCP_OAUTH_SIGNING_SECRET: SECRET,
  MCP_OAUTH_LOGIN_URL: "https://meals.test/login",
  MCP_ALLOWED_HOSTS: "127.0.0.1",
};

const config = loadConfig({ ...BASE_ENV, MCP_ENABLE_ADMIN_TOOLS: "true" });

const ROLES: Record<string, "USER" | "ADMIN"> = {
  "user-1": "USER",
  "admin-1": "ADMIN",
};

let http: Server;
let origin: string;
const roleLookups: string[] = [];
const logLines: string[] = [];

beforeAll(async () => {
  const app = createApp({
    config,
    log: (line) => logLines.push(line),
    createApi: (userId) =>
      fakeApi({
        "admin.myRole": () => {
          roleLookups.push(userId);
          return { role: ROLES[userId] };
        },
        "freezer.list": () => [],
      }).api,
  });
  http = createServer(app);
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => http.close(resolve));
});

const tokenFor = (userId: string, secret = SECRET) =>
  signAccessToken(
    { sub: userId, client_id: "client", iss: ISSUER, aud: ISSUER },
    secret,
    60,
  );

async function rpc(
  method: string,
  params: Record<string, unknown>,
  token?: string,
) {
  const response = await fetch(`${origin}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return response;
}

describe("POST /mcp", () => {
  it("points unauthenticated clients at the OAuth metadata", async () => {
    const response = await rpc("tools/list", {});

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      `Bearer resource_metadata="${ISSUER}/.well-known/oauth-protected-resource"`,
    );
  });

  it("rejects tokens signed with another secret", async () => {
    const response = await rpc("tools/list", {}, tokenFor("user-1", "wrong"));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      'error="invalid_token"',
    );
  });

  it("answers initialize with a plain JSON body and server instructions", async () => {
    const response = await rpc(
      "initialize",
      {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      },
      tokenFor("user-1"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = await response.json();
    expect(body.result.serverInfo.name).toBe("meal-planner-mcp");
    expect(body.result.capabilities).toHaveProperty("tools");
    expect(body.result.capabilities).toHaveProperty("prompts");
    expect(body.result.instructions).toContain("Meal Planner");
  });

  it("lists admin tools for admins only, looking the role up once per user", async () => {
    const list = async (userId: string) => {
      const response = await rpc("tools/list", {}, tokenFor(userId));
      const body = await response.json();
      return (body.result.tools as { name: string }[]).map((tool) => tool.name);
    };

    const userTools = await list("user-1");
    const adminTools = await list("admin-1");
    await list("admin-1");

    expect(userTools).toContain("get-week-plan");
    expect(userTools.some((name) => name.startsWith("admin-"))).toBe(false);
    expect(adminTools).toContain("admin-list-users");
    expect(roleLookups.filter((id) => id === "admin-1")).toHaveLength(1);
  });

  it("runs a tool call and logs it", async () => {
    const response = await rpc(
      "tools/call",
      { name: "list-freezer", arguments: {} },
      tokenFor("user-1"),
    );

    const body = await response.json();
    expect(body.result.structuredContent).toEqual({
      count: 0,
      totalPortions: 0,
      items: [],
    });
    expect(logLines.at(-1)).toMatch(
      /^tool=list-freezer user=user-1 ok=true ms=\d+$/,
    );
  });

  it("refuses requests for other host names", async () => {
    // fetch() does not allow overriding Host, so go through node:http.
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(
        `${origin}/mcp`,
        {
          method: "POST",
          headers: {
            host: "evil.example",
            "content-type": "application/json",
            authorization: `Bearer ${tokenFor("user-1")}`,
          },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on("error", reject);
      req.end("{}");
    });
    expect(status).toBe(421);
  });

  it("only allows POST", async () => {
    const response = await fetch(`${origin}/mcp`);
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });
});

describe("admin tools switch", () => {
  it("is off unless explicitly enabled, and rejects unclear values", () => {
    expect(loadConfig(BASE_ENV).adminToolsEnabled).toBe(false);
    expect(
      loadConfig({ ...BASE_ENV, MCP_ENABLE_ADMIN_TOOLS: "false" })
        .adminToolsEnabled,
    ).toBe(false);
    expect(
      loadConfig({ ...BASE_ENV, MCP_ENABLE_ADMIN_TOOLS: " TRUE " })
        .adminToolsEnabled,
    ).toBe(true);
    expect(() =>
      loadConfig({ ...BASE_ENV, MCP_ENABLE_ADMIN_TOOLS: "yes please" }),
    ).toThrow(/MCP_ENABLE_ADMIN_TOOLS/);
  });

  it("keeps the admin tools away from administrators too when off", async () => {
    const lookups: string[] = [];
    const app = createApp({
      config: loadConfig(BASE_ENV),
      log: () => {},
      createApi: (userId) =>
        fakeApi({
          "admin.myRole": () => {
            lookups.push(userId);
            return { role: "ADMIN" };
          },
          // Would succeed if the tool somehow ran.
          "admin.listUsers": () => [],
        }).api,
    });
    const server = createServer(app);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
    const post = async (method: string, params: Record<string, unknown>) => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${tokenFor("admin-1")}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      return response.json();
    };

    try {
      const list = await post("tools/list", {});
      const names = (list.result.tools as { name: string }[]).map(
        (t) => t.name,
      );
      expect(names).toContain("get-week-plan");
      expect(names.filter((name) => name.startsWith("admin-"))).toEqual([]);

      // Not merely hidden from the list: the tool does not exist.
      const call = await post("tools/call", {
        name: "admin-list-users",
        arguments: {},
      });
      expect(JSON.stringify(call)).toContain("admin-list-users not found");
      expect(call.result?.structuredContent).toBeUndefined();

      const init = await post("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      });
      expect(init.result.instructions).not.toContain("admin-");
      expect(lookups).toEqual([]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe("API coverage", () => {
  // Procedures that deliberately have no tool of their own, and why.
  const NOT_EXPOSED: Record<string, string> = {
    "recipe.patchField": "update-recipe covers the same fields",
    "recipe.markUsed": "usage is tracked by saving week plans",
    "freezer.remove": "set-freezer-item with portions 0",
    "ingredient.listWithoutUnit": "list-ingredients filter: missing-unit",
    "ingredient.listWithoutCategory":
      "list-ingredients filter: missing-category",
    "planner.extraSuggest": "list-extra-catalog with search",
    "planner.packageSuggest": "list-shopping-packages with search",
  };

  it("every API procedure is reachable through the MCP server", () => {
    const srcDir = join(dirname(fileURLToPath(import.meta.url)), "../src");
    const sources = [
      join(srcDir, "app.ts"),
      ...readdirSync(join(srcDir, "tools")).map((file) =>
        join(srcDir, "tools", file),
      ),
    ]
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    const used = new Set(
      [
        ...sources.matchAll(
          /\bapi\s*\.\s*(\w+)\s*\.\s*(\w+)\s*\.\s*(?:query|mutate)\b/g,
        ),
      ].map((match) => `${match[1]}.${match[2]}`),
    );
    const procedures = Object.keys(appRouter._def.procedures);

    const missing = procedures.filter(
      (name) => !used.has(name) && !(name in NOT_EXPOSED),
    );
    expect(missing).toEqual([]);

    // Keep the exception list honest in both directions.
    expect(Object.keys(NOT_EXPOSED).filter((name) => used.has(name))).toEqual(
      [],
    );
    expect(
      Object.keys(NOT_EXPOSED).filter((name) => !procedures.includes(name)),
    ).toEqual([]);
    expect([...used].filter((name) => !procedures.includes(name))).toEqual([]);
  });
});
