"use client";

import { useEffect, useState } from "react";
import { trpc } from "../lib/trpcClient";

export default function Page() {
  const [recipes, setRecipes] = useState<any[]>([]);
  useEffect(() => { trpc.recipe.list.query().then(setRecipes); }, []);
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Oppskrifter</h1>
      <ul className="list-disc pl-6">
        {recipes.map((r) => <li key={r.id}>{r.title} ({r.diet})</li>)}
      </ul>
    </main>
  );
}
