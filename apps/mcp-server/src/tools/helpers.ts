import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod";
import type { MealsApi } from "../api.js";

export interface ToolContext {
  server: McpServer;
  api: MealsApi;
  /** IANA zone that decides what "today" means for the user. */
  timeZone: string;
  /** Injectable clock, so week resolution is testable. */
  now: () => Date;
  /** Optional sink for one line per tool call (name, outcome, duration). */
  onToolCall?: (event: {
    tool: string;
    ok: boolean;
    durationMs: number;
    error?: string;
  }) => void;
}

/**
 * An error whose message is meant for the model: it explains what went wrong
 * and, where possible, what to do instead. `details` is returned alongside it
 * as structured content (e.g. the candidates for an ambiguous name).
 */
export class ToolError extends Error {
  constructor(
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ToolError";
  }
}

// ─── Results ───────────────────────────────────────────────────────────

export function ok(payload: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  // tRPC client errors carry the server-side code in `data`.
  const code = (error as { data?: { code?: string } }).data?.code;
  if (code === "UNAUTHORIZED") {
    return `${error.message} (Brukeren må være medlem av en husholdning for å bruke dette verktøyet.)`;
  }
  if (code === "FORBIDDEN") {
    return `${error.message} (Krever administratorrolle.)`;
  }
  return error.message;
}

export function fail(error: unknown, context: string): CallToolResult {
  const payload: Record<string, unknown> = {
    ok: false,
    error: `${context}: ${describeError(error)}`,
  };
  if (error instanceof ToolError && error.details) {
    Object.assign(payload, error.details);
  }
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError: true,
  };
}

// ─── Tool registration ─────────────────────────────────────────────────

/**
 * What a tool does to the data, mapped onto MCP tool annotations so clients
 * can decide which calls need confirmation:
 * - `read`: no side effects.
 * - `add`: creates something; repeating the call creates more.
 * - `set`: writes a value without removing anything else; repeating the
 *   same call changes nothing further.
 * - `destructive`: can delete data or replace it wholesale (a recipe's
 *   ingredient list, a planned day, a freezer entry).
 *
 * `destructive` tools are assumed idempotent — deleting twice is the same as
 * deleting once — unless the tool says otherwise with `idempotent: false`.
 */
export type ToolKind = "read" | "add" | "set" | "destructive";

const ANNOTATIONS: Record<ToolKind, Record<string, boolean>> = {
  read: { readOnlyHint: true, openWorldHint: false },
  add: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  set: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  destructive: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};

export function defineTool<Shape extends z.ZodRawShape>(
  ctx: ToolContext,
  name: string,
  config: {
    title: string;
    description: string;
    kind: ToolKind;
    /** Overrides the kind's default, for writes whose result differs per call. */
    idempotent?: boolean;
    input: Shape;
    /** Prefix for error messages, e.g. "Kunne ikke hente ukesplan". */
    errorContext: string;
  },
  handler: (
    args: z.infer<z.ZodObject<Shape>>,
  ) => Promise<Record<string, unknown>>,
): void {
  const callback = async (args: unknown): Promise<CallToolResult> => {
    const started = Date.now();
    try {
      const payload = await handler(args as z.infer<z.ZodObject<Shape>>);
      ctx.onToolCall?.({
        tool: name,
        ok: true,
        durationMs: Date.now() - started,
      });
      return ok(payload);
    } catch (error) {
      const result = fail(error, config.errorContext);
      ctx.onToolCall?.({
        tool: name,
        ok: false,
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      });
      return result;
    }
  };

  ctx.server.registerTool(
    name,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.input,
      annotations: {
        title: config.title,
        ...ANNOTATIONS[config.kind],
        ...(config.idempotent === undefined
          ? {}
          : { idempotentHint: config.idempotent }),
      },
    },
    // The SDK's callback type is derived from the schema through its own
    // zod-compat layer; the handler above is already typed from the same
    // shape, so the cast only bridges the two equivalent views.
    callback as never,
  );
}

// ─── Dates and weeks ───────────────────────────────────────────────────
//
// The API stores week starts as UTC midnight on the Monday. Everything here
// works on plain `YYYY-MM-DD` strings so no local-time arithmetic sneaks in.

export const WEEKDAYS = [
  "mandag",
  "tirsdag",
  "onsdag",
  "torsdag",
  "fredag",
  "lørdag",
  "søndag",
] as const;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** Today's calendar date in the given zone, as `YYYY-MM-DD`. */
export function todayIn(timeZone: string, now: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function parseDateOnly(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new ToolError(`Ugyldig dato: "${value}". Bruk formatet YYYY-MM-DD.`);
  }
  return date;
}

/** Accepts `YYYY-MM-DD` or a full ISO timestamp; returns `YYYY-MM-DD`. */
export function toDateOnly(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : value.toISOString().slice(0, 10);
  }
  const text = String(value);
  if (DATE_ONLY.test(text)) return text;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function addDays(dateOnly: string, days: number): string {
  const date = parseDateOnly(dateOnly);
  return new Date(date.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** The Monday of the week containing the given date. */
export function mondayOf(dateOnly: string): string {
  const date = parseDateOnly(dateOnly);
  const day = date.getUTCDay(); // 0 = Sunday
  return addDays(dateOnly, (day === 0 ? -6 : 1) - day);
}

/** Zero-based weekday index with Monday = 0, matching the API's `dayIndex`. */
export function dayIndexOf(dateOnly: string): number {
  return (parseDateOnly(dateOnly).getUTCDay() + 6) % 7;
}

const WEEK_ALIASES: Record<string, number> = {
  current: 0,
  this: 0,
  denne: 0,
  next: 1,
  neste: 1,
  previous: -1,
  last: -1,
  forrige: -1,
};

/**
 * Resolve the `week` tool argument to the Monday of that week (`YYYY-MM-DD`).
 * Accepts any date in the week, or "current" / "next" / "previous". Omitted
 * means the current week in the user's time zone — not the server's, which
 * runs in UTC and would be a day off late on Sunday evenings.
 */
export function resolveWeek(
  ctx: ToolContext,
  week: string | undefined,
): string {
  const thisMonday = mondayOf(todayIn(ctx.timeZone, ctx.now()));
  const raw = week?.trim();
  if (!raw) return thisMonday;
  const alias = WEEK_ALIASES[raw.toLowerCase()];
  if (alias !== undefined) return addDays(thisMonday, alias * 7);
  const dateOnly = toDateOnly(raw);
  if (!dateOnly) {
    throw new ToolError(
      `Ugyldig uke: "${raw}". Bruk en dato (YYYY-MM-DD) eller "current", "next" eller "previous".`,
    );
  }
  return mondayOf(dateOnly);
}

/** The API's canonical representation of a week start. */
export function toApiWeekStart(monday: string): string {
  return `${monday}T00:00:00.000Z`;
}

/** `YYYY-MM-DD` (or an ISO timestamp) to the ISO datetime the API expects. */
export function toApiDateTime(value: string): string {
  const dateOnly = toDateOnly(value.trim());
  if (!dateOnly) {
    throw new ToolError(`Ugyldig dato: "${value}". Bruk formatet YYYY-MM-DD.`);
  }
  if (DATE_ONLY.test(value.trim())) return `${dateOnly}T00:00:00.000Z`;
  return new Date(value).toISOString();
}

export const weekArg = z
  .string()
  .optional()
  .describe(
    'Uka det gjelder: en hvilken som helst dato i uka (YYYY-MM-DD), eller "current", "next" eller "previous". Utelat for inneværende uke.',
  );

// ─── Names ─────────────────────────────────────────────────────────────

export const normalizeName = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, " ");

/** Strip keys whose value is `undefined`, so payloads stay compact. */
export function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}

/**
 * Find the entry a name refers to: a single exact (case-insensitive) match
 * wins, otherwise a single partial match is accepted. Anything else is
 * ambiguous and is reported back rather than guessed at.
 */
export function matchByName<T extends { name: string }>(
  items: T[],
  query: string,
): { match: T | null; candidates: T[] } {
  const wanted = normalizeName(query);
  const exact = items.filter((item) => normalizeName(item.name) === wanted);
  if (exact.length === 1) return { match: exact[0]!, candidates: exact };
  // Names that differ only in case or spacing: choosing one would be a guess.
  if (exact.length > 1) return { match: null, candidates: exact };
  const partial = items.filter((item) =>
    normalizeName(item.name).includes(wanted),
  );
  if (partial.length === 1) return { match: partial[0]!, candidates: partial };
  return { match: null, candidates: partial };
}
