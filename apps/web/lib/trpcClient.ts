import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@repo/api"; // pek til serverens type-eksport (ikke dist)

export const trpc = createTRPCReact<AppRouter>();
