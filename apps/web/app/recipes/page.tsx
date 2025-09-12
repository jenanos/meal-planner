"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc } from "../../lib/trpcClient";
import { Button } from "@repo/ui/components/Button";

const householdId = "00000000-0000-0000-0000-000000000001";

export default function RecipesPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["recipes"],
    queryFn: () => trpc.recipe.list.query({ householdId }),
  });

  const [title, setTitle] = useState("");
  const [diet, setDiet] = useState("MEAT");

  const create = useMutation({
    mutationFn: () =>
      trpc.recipe.create.mutate({ householdId, title, diet: diet as any }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      setTitle("");
    },
  });

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">Recipes</h1>
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
          if (!title) return;
          create.mutate();
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
            onChange={(e) => setDiet(e.target.value)}
            required
          >
            <option value="MEAT">MEAT</option>
            <option value="FISH">FISH</option>
            <option value="VEG">VEG</option>
          </select>
        </div>
        <Button type="submit">Create</Button>
      </form>
      {create.error && <p className="text-red-500">Error creating recipe</p>}
    </div>
  );
}

