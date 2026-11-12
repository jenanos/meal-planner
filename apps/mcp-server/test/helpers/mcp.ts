import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { MealsApi } from "../../src/api";
import { buildServer } from "../../src/server";

type Handler = (input: any) => unknown;

/**
 * A stand-in for the tRPC client: `api.planner.getWeekPlan.query(input)`
 * dispatches to `handlers["planner.getWeekPlan"]`, and every call is
 * recorded. Calling a procedure with no handler fails loudly, so a test
 * spells out exactly which API calls a tool is expected to make.
 */
export function fakeApi(handlers: Record<string, Handler>) {
  const calls: { path: string; input: unknown }[] = [];

  const node = (path: string[]): unknown =>
    new Proxy(
      {},
      {
        get(_target, key) {
          if (typeof key !== "string") return undefined;
          if (key === "query" || key === "mutate") {
            return async (input: unknown) => {
              const name = path.join(".");
              calls.push({ path: name, input });
              const handler = handlers[name];
              if (!handler) throw new Error(`Unexpected API call: ${name}`);
              return handler(input);
            };
          }
          return node([...path, key]);
        },
      },
    );

  return {
    api: node([]) as MealsApi,
    calls,
    callsTo: (path: string) =>
      calls.filter((call) => call.path === path).map((call) => call.input),
  };
}

/** An error shaped like the ones the tRPC client throws. */
export function trpcError(code: string, message: string) {
  return Object.assign(new Error(message), { data: { code } });
}

export async function connect(options: {
  api: MealsApi;
  isAdmin?: boolean;
  /** Fixed clock; defaults to Thursday 12 November 2026, midday in Oslo. */
  now?: Date;
}) {
  const server = buildServer({
    api: options.api,
    adminTools: options.isAdmin ?? false,
    timeZone: "Europe/Oslo",
    lockScope: "test-user",
    now: () => options.now ?? new Date("2026-11-12T11:00:00.000Z"),
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    return {
      isError: result.isError === true,
      data: result.structuredContent as Record<string, any>,
    };
  };

  return { client, server, call };
}

// ─── Fixtures ──────────────────────────────────────────────────────────

export const RECIPES = {
  laks: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Ovnsbakt laks",
    category: "FISK",
    everydayScore: 2,
    healthScore: 5,
    lastUsed: null,
    usageCount: 4,
    ingredients: [],
  },
  taco: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Taco",
    category: "STORFE",
    everydayScore: 4,
    healthScore: 2,
    lastUsed: "2026-11-02T00:00:00.000Z",
    usageCount: 12,
    ingredients: [],
  },
  lasagne: {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Lasagne",
    category: "STORFE",
    everydayScore: 3,
    healthScore: 3,
    lastUsed: null,
    usageCount: 7,
    ingredients: [],
  },
} as const;

type Day =
  | {
      type: "RECIPE" | "FREEZER";
      recipe: (typeof RECIPES)[keyof typeof RECIPES];
    }
  | { type: "TAKEAWAY" | "EMPTY" };

/** A week plan response as the API returns it; unspecified days are empty. */
export function weekPlan(weekStart: string, days: Record<number, Day> = {}) {
  return {
    weekStart: `${weekStart}T00:00:00.000Z`,
    updatedAt: null,
    days: [0, 1, 2, 3, 4, 5, 6].map((dayIndex) => {
      const day = days[dayIndex] ?? { type: "EMPTY" as const };
      return {
        dayIndex,
        entryType: day.type,
        recipe: "recipe" in day ? day.recipe : null,
      };
    }),
    suggestions: { longGap: [], frequent: [] },
  };
}
