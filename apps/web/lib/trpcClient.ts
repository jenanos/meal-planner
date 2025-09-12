import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@repo/api";

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({ url: `${process.env.NEXT_PUBLIC_API_URL}/trpc` })
  ],
});
