"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { trpc } from "../lib/trpcClient";
import { mockLink } from "../lib/mock/trpcLink";
import { MockModeNotice } from "./components/MockModeNotice";

function getApiUrl() {
    if (typeof window !== "undefined") return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    return process.env.API_URL ?? "http://localhost:4000";
}

export function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => new QueryClient());
    const useMock =
        (process.env.NEXT_PUBLIC_MOCK_MODE ?? process.env.MOCK_MODE ?? "")
            .toString()
            .toLowerCase() === "true" ||
        (process.env.NEXT_PUBLIC_MOCK_MODE ?? process.env.MOCK_MODE ?? "") === "1";
    const [trpcClient] = useState(() =>
        trpc.createClient({
            links: useMock ? [mockLink] : [httpBatchLink({ url: `${getApiUrl()}/trpc` })],
        })
    );

    return (
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
                {useMock && <MockModeNotice />}
                {children}
            </QueryClientProvider>
        </trpc.Provider>
    );
}