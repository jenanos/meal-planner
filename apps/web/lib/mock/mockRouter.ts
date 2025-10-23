import type { AnyRouter } from "@trpc/server";

/**
 * Minimal stand-in for the backend AppRouter type. We deliberately fall back to
 * `AnyRouter` here to avoid depending on the backend package during builds.
 * The mock store provides the runtime shape that the frontend expects.
 */
export type MockAppRouter = AnyRouter;
