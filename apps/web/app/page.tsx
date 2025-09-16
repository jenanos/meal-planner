"use client";
export const dynamic = "force-dynamic";

import { trpc } from "../lib/trpcClient";
import Link from "next/link";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";

type ListOutput = inferRouterOutputs<AppRouter>["recipe"]["list"];
type RecipeListItem = ListOutput["items"][number];

export default function Page() {
  const { data, isLoading, error } = trpc.recipe.list.useQuery({
    page: 1,
    pageSize: 20,
  });

  if (isLoading) return <main className="p-6">Loading…</main>;
  if (error) return <main className="p-6 text-red-500">Failed to load</main>;

  const recipes: RecipeListItem[] = data?.items ?? [];

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
            {r.name} ({r.category}) – E{r.everydayScore}/H{r.healthScore}
          </li>
        ))}
      </ul>

      <p className="mt-6">
        Se ukeplan:{" "}
        <Link href="/planner" className="text-blue-600 underline">Gå til Planner</Link>
      </p>
    </main>
  );
}
