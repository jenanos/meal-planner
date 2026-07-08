"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { trpc } from "../lib/trpcClient";
import { isDemoMode } from "../lib/demo";

function getApiUrl() {
    if (typeof window !== "undefined") return process.env.NEXT_PUBLIC_API_URL ?? "/api";
    return process.env.API_URL ?? process.env.MEALS_API_INTERNAL_ORIGIN ?? "http://localhost:4000";
}

function getTrpcUrl() {
    // Demo mode talks to the embedded in-app demo API instead of the
    // external meals-api service. Keep the URL relative so server render
    // and browser agree; no query ever fires during SSR in this app.
    if (isDemoMode) return "/api/demo";
    return `${getApiUrl()}/trpc`;
}

export function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => new QueryClient());
    const [trpcClient] = useState(() =>
        trpc.createClient({
            links: [
                httpBatchLink({
                    url: getTrpcUrl(),
                    // Send the better-auth session cookie even when
                    // NEXT_PUBLIC_API_URL points at a different origin than
                    // the web app (same-origin requests are unaffected).
                    fetch: (input, init) =>
                        fetch(input, { ...init, credentials: "include" }),
                }),
            ],
        })
    );

    return (
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        </trpc.Provider>
    );
}
