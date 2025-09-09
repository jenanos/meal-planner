import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import { AppRouter } from "@repo/api";

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/trpc`
    })
  ]
});
