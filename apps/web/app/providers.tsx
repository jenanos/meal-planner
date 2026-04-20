"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { trpc } from "../lib/trpcClient";

function getApiUrl() {
    if (typeof window !== "undefined") return process.env.NEXT_PUBLIC_API_URL ?? "/api";
    return process.env.API_URL ?? process.env.MEALS_API_INTERNAL_ORIGIN ?? "http://localhost:4000";
}

export function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => new QueryClient());
    const [trpcClient] = useState(() =>
        trpc.createClient({
            links: [httpBatchLink({ url: `${getApiUrl()}/trpc` })],
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
