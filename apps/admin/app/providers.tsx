"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { trpc } from "../lib/trpcClient";

function isAuthError(error: unknown): boolean {
  if (!(error instanceof TRPCClientError)) return false;
  const code = (error.data as { code?: string } | undefined)?.code;
  return code === "UNAUTHORIZED" || code === "FORBIDDEN";
}

function getApiUrl() {
  if (typeof window !== "undefined")
    return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  return process.env.API_URL ?? "http://localhost:4000";
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Retrying a 401/403 only repeats the same answer.
            retry: (failureCount, error) =>
              failureCount < 3 && !isAuthError(error),
          },
        },
      }),
  );
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${getApiUrl()}/trpc`,
          // Send the session cookie when the API is on another origin
          // (locally admin is on :3001 and the API on :4000).
          fetch: (input, init) =>
            fetch(input, { ...init, credentials: "include" }),
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
