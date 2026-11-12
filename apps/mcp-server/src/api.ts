import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@repo/api";

export type MealsApi = ReturnType<typeof createTRPCProxyClient<AppRouter>>;

/**
 * One tRPC client per authenticated MCP request, with the user identity
 * bound at creation time. A module-level shared client would be unsafe
 * here: `httpBatchLink` batches calls made in the same tick into a single
 * HTTP request with a single `headers()` evaluation, so concurrent MCP
 * requests from different users could have their tRPC calls coalesced
 * under one `x-mcp-on-behalf-of` header.
 */
export function createMealsApi(options: {
  apiOrigin: string;
  apiKey: string | null;
  userId: string;
}): MealsApi {
  const url = new URL("/trpc", options.apiOrigin).toString();
  return createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url,
        headers() {
          const headers: Record<string, string> = {
            "x-mcp-on-behalf-of": options.userId,
          };
          if (options.apiKey) headers["x-api-key"] = options.apiKey;
          return headers;
        },
      }),
    ],
  });
}
