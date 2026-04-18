import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";

export type RouterOutputs = inferRouterOutputs<AppRouter>;
