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
    // external meals-api service.
    if (isDemoMode) {
        if (typeof window !== "undefined") return "/api/demo";
        const port = process.env.PORT ?? "3000";
        return `http://localhost:${port}/api/demo`;
    }
    return `${getApiUrl()}/trpc`;
}

export function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => new QueryClient());
    const [trpcClient] = useState(() =>
        trpc.createClient({
            links: [httpBatchLink({ url: getTrpcUrl() })],
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
