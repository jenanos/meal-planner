"use client";
export const dynamic = "force-dynamic";

import { trpc } from "../lib/trpcClient";

export default function Page() {
  const householdId = "00000000-0000-0000-0000-000000000001";
  const {
    data: recipes = [],
    isLoading,
    error,
  } = trpc.recipe.list.useQuery({ householdId });

  if (isLoading) return <main className="p-6">Loading…</main>;
  if (error) return <main className="p-6 text-red-500">Failed to load</main>;

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Oppskrifter</h1>
      <ul className="list-disc pl-6">
        {recipes.map((r) => (
          <li key={r.id}>
            {r.title} ({r.diet})
          </li>
        ))}
      </ul>
    </main>
  );
}
