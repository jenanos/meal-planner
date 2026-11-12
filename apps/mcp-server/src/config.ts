import type { OAuthConfig } from "./oauth/routes.js";

export interface HostEntry {
  host: string;
  port: string | null;
}

export interface ServerConfig {
  port: number;
  mealsApiOrigin: string;
  mcpApiKey: string | null;
  oauth: OAuthConfig;
  allowedHosts: HostEntry[];
  /** IANA zone used to decide what "today" and "this week" mean. */
  timeZone: string;
  /**
   * Master switch for the user, allowlist and household administration
   * tools. Off unless explicitly enabled: with it off they are not offered
   * to anyone, administrators included.
   */
  adminToolsEnabled: boolean;
}

type Env = Record<string, string | undefined>;

function parsePositiveIntEnv(
  name: string,
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error(
      `${name} must be a positive integer (seconds); got ${JSON.stringify(raw)}`,
    );
  }
  return n;
}

// Split "hostname[:port]" into its parts, lowercasing the hostname so the
// comparison is case-insensitive (DNS labels are). Handles `[::1]:5050`-style
// bracketed IPv6 too. Allowlist entries without an explicit port match any
// port on the request side; entries that specify a port require an exact
// match.
export function parseHost(value: string): HostEntry {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    const closeIdx = trimmed.indexOf("]");
    if (closeIdx === -1) return { host: trimmed, port: null };
    const host = trimmed.slice(0, closeIdx + 1);
    const rest = trimmed.slice(closeIdx + 1);
    return { host, port: rest.startsWith(":") ? rest.slice(1) : null };
  }
  const colonIdx = trimmed.lastIndexOf(":");
  if (colonIdx === -1) return { host: trimmed, port: null };
  return {
    host: trimmed.slice(0, colonIdx),
    port: trimmed.slice(colonIdx + 1),
  };
}

export function isAllowedHost(
  allowed: HostEntry[],
  headerValue: string,
): boolean {
  if (allowed.length === 0) return true;
  const incoming = parseHost(headerValue);
  return allowed.some((entry) => {
    if (entry.host !== incoming.host) return false;
    if (entry.port === null) return true;
    return entry.port === incoming.port;
  });
}

function parseBooleanEnv(name: string, raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase() ?? "";
  if (value === "" || value === "false" || value === "0") return false;
  if (value === "true" || value === "1") return true;
  // A typo must not silently enable (or appear to enable) a dangerous switch.
  throw new Error(
    `${name} must be "true" or "false"; got ${JSON.stringify(raw)}`,
  );
}

function resolveTimeZone(raw: string | undefined): string {
  const zone = raw?.trim() || "Europe/Oslo";
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
  } catch {
    throw new Error(`MCP_TIMEZONE is not a valid IANA time zone: ${zone}`);
  }
  return zone;
}

export function loadConfig(env: Env = process.env): ServerConfig {
  const mealsApiOrigin =
    env.MEALS_API_INTERNAL_ORIGIN ??
    env.MEALS_API_URL ??
    "http://localhost:4000";

  const issuer = env.MCP_OAUTH_ISSUER?.trim() || null;
  const signingSecret = env.MCP_OAUTH_SIGNING_SECRET?.trim() || null;
  const loginUrl = env.MCP_OAUTH_LOGIN_URL?.trim() || null;

  if (!issuer || !signingSecret || !loginUrl) {
    throw new Error(
      "OAuth provider config missing. Set MCP_OAUTH_ISSUER, MCP_OAUTH_SIGNING_SECRET, MCP_OAUTH_LOGIN_URL.",
    );
  }

  return {
    port: Number(env.PORT ?? 5050),
    mealsApiOrigin,
    mcpApiKey: env.MCP_API_KEY?.trim() || null,
    oauth: {
      issuer,
      signingSecret,
      apiOrigin: mealsApiOrigin,
      loginUrl,
      accessTokenTtl: parsePositiveIntEnv(
        "MCP_OAUTH_ACCESS_TOKEN_TTL",
        env.MCP_OAUTH_ACCESS_TOKEN_TTL,
        3600,
      ),
      refreshTokenTtl: parsePositiveIntEnv(
        "MCP_OAUTH_REFRESH_TOKEN_TTL",
        env.MCP_OAUTH_REFRESH_TOKEN_TTL,
        60 * 60 * 24 * 30,
      ),
    },
    allowedHosts: (env.MCP_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean)
      .map(parseHost),
    timeZone: resolveTimeZone(env.MCP_TIMEZONE),
    adminToolsEnabled: parseBooleanEnv(
      "MCP_ENABLE_ADMIN_TOOLS",
      env.MCP_ENABLE_ADMIN_TOOLS,
    ),
  };
}
