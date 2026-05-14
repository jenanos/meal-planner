export interface SessionUser {
  id: string;
  email: string;
  name?: string;
}

/**
 * Validate a better-auth session by forwarding the request's `Cookie`
 * header to the meals-api `/auth/get-session` endpoint. We deliberately
 * don't import better-auth into the MCP server – the API is the source of
 * truth for who is logged in.
 *
 * Returns the authenticated user, or null if no valid session.
 */
export async function getSessionFromCookie(
  apiOrigin: string,
  cookieHeader: string | undefined,
): Promise<SessionUser | null> {
  if (!cookieHeader) return null;

  let response: Response;
  try {
    response = await fetch(new URL("/auth/get-session", apiOrigin).toString(), {
      method: "GET",
      headers: { cookie: cookieHeader, accept: "application/json" },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;

  const user = (data as Record<string, unknown>).user;
  if (!user || typeof user !== "object") return null;
  const u = user as Record<string, unknown>;
  if (typeof u.id !== "string" || typeof u.email !== "string") return null;

  return {
    id: u.id,
    email: u.email,
    name: typeof u.name === "string" ? u.name : undefined,
  };
}
