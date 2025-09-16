"use client";
export const dynamic = "force-dynamic";

import { trpc } from "../lib/trpcClient";
import Link from "next/link";

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
      <p className="mt-2">
        Vil du legge til nye oppskrifter?{" "}
        <Link href="/recipes" className="text-blue-600 underline">Gå til Recipes</Link>
      </p>
      <ul className="list-disc pl-6 mt-4">
        {recipes.map((r) => (
          <li key={r.id}>
            {r.title} ({r.diet})
          </li>
        ))}
      </ul>
    </main>
  );
}
