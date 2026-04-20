import { createTRPCReact } from "@trpc/react-query";
import type { CreateTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@repo/api";

export type TrpcReactClient = CreateTRPCReact<AppRouter, unknown>;

export const trpc: TrpcReactClient = createTRPCReact<AppRouter>();
