/**
 * Client-safe demo-mode flag. `NEXT_PUBLIC_DEMO_MODE` is inlined at build
 * time, so setting it on the deployment (e.g. a Vercel project) turns the
 * whole app into an open, self-contained demo backed by an embedded
 * in-memory database — no API server, Postgres, or login required.
 */
const flag = process.env.NEXT_PUBLIC_DEMO_MODE?.trim().toLowerCase();

export const isDemoMode = flag === "1" || flag === "true";

/** Mirrors DEMO_USER seeded by @repo/database (kept client-safe here). */
export const demoUser = {
  id: "demo-user",
  email: "demo@butta.example",
  name: "Demobruker",
  image: null,
  emailVerified: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};
