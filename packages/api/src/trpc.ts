import { initTRPC, TRPCError } from "@trpc/server";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
}

export interface CreateContextOptions {
  user: AuthUser | null;
  householdId: string | null;
}

const t = initTRPC.context<CreateContextOptions>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/** Procedure that requires a valid session and household membership. */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user || !ctx.householdId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Du må være logget inn for å bruke denne funksjonen.",
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      householdId: ctx.householdId,
    },
  });
});

