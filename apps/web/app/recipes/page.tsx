"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { trpc } from "../../lib/trpcClient";
import { Button } from "@repo/ui";
import type { Diet } from "@repo/api";

const householdId = "00000000-0000-0000-0000-000000000001";

export default function RecipesPage() {
  const utils = trpc.useUtils();

  const { data, isLoading, error } = trpc.recipe.list.useQuery({
    householdId,
  });

  const [title, setTitle] = useState("");
  const [diet, setDiet] = useState<Diet>("MEAT");

  const create = trpc.recipe.create.useMutation({
    onSuccess: () => {
      utils.recipe.list.invalidate({ householdId });
      setTitle("");
    },
  });

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">Recipes</h1>

      {isLoading && <p>Loading…</p>}
      {error && <p className="text-red-500">Failed to load recipes</p>}

      <ul className="space-y-1">
        {data?.map((r) => (
          <li key={r.id}>
            {r.title} - {r.diet}
          </li>
        ))}
      </ul>

      <form
        className="flex gap-2 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title || create.isPending) return;
          create.mutate({ householdId, title, diet });
        }}
      >
        <div className="flex flex-col">
          <label className="text-sm">Title</label>
          <input
            className="border px-2 py-1"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm">Diet</label>
          <select
            className="border px-2 py-1"
            value={diet}
            onChange={(e) => setDiet(e.target.value as Diet)}
            required
          >
            <option value="MEAT">MEAT</option>
            <option value="FISH">FISH</option>
            <option value="VEG">VEG</option>
          </select>
        </div>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create"}
        </Button>
      </form>

      {create.error && <p className="text-red-500">Error creating recipe</p>}
    </div>
  );
}
