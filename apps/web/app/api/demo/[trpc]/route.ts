import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

// The embedded PGlite database lives in process memory and must not be
// evaluated at build time.
export const dynamic = "force-dynamic";

function isDemoMode() {
  const value = process.env.NEXT_PUBLIC_DEMO_MODE?.trim().toLowerCase();
  return value === "1" || value === "true";
}

async function handler(req: Request) {
  if (!isDemoMode()) {
    return new Response("Not found", { status: 404 });
  }

  // Imported lazily so that non-demo builds/deployments never evaluate the
  // database packages (they require DATABASE_URL at module load).
  const [{ appRouter }, { DEMO_USER, ensureDemoDatabaseReady }] =
    await Promise.all([import("@repo/api"), import("@repo/database")]);

  // Waits for migrations + demo seed on the first request per instance.
  const { householdId } = await ensureDemoDatabaseReady();

  return fetchRequestHandler({
    endpoint: "/api/demo",
    req,
    router: appRouter,
    createContext: () => ({ user: DEMO_USER, householdId }),
  });
}

export { handler as GET, handler as POST };
