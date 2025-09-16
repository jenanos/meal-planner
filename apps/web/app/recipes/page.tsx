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
  const [ingredients, setIngredients] = useState<Array<{ name: string }>>([]);
  const [ingName, setIngName] = useState("");

  const create = trpc.recipe.create.useMutation({
    onSuccess: () => {
      utils.recipe.list.invalidate({ householdId });
      setTitle("");
      setIngredients([]);
      setIngName("");
    },
  });

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">Recipes</h1>

      {isLoading && <p>Loading…</p>}
      {error && <p className="text-red-500">Failed to load recipes</p>}

      <ul className="space-y-2">
        {data?.map((r) => (
          <li key={r.id} className="border rounded p-2">
            <div className="font-medium">
              {r.title} - {r.diet}
            </div>
            {r.ingredients?.length ? (
              <ul className="list-disc pl-6 text-sm text-gray-600">
                {r.ingredients.map((ri) => (
                  <li key={ri.ingredientId}>{ri.ingredient.name}</li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-gray-500">No ingredients</div>
            )}
          </li>
        ))}
      </ul>

      <form
        className="flex flex-col gap-3 items-start"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title || create.isPending) return;
          create.mutate({ householdId, title, diet, ingredients });
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

        <div className="flex flex-col gap-2 w-full">
          <label className="text-sm">Ingredients</label>
          <div className="flex gap-2 w-full">
            <input
              className="border px-2 py-1 flex-1"
              placeholder="e.g. Onion"
              value={ingName}
              onChange={(e) => setIngName(e.target.value)}
            />
            <Button
              type="button"
              onClick={() => {
                const name = ingName.trim();
                if (!name) return;
                if (!ingredients.some((i) => i.name.toLowerCase() === name.toLowerCase())) {
                  setIngredients([...ingredients, { name }]);
                }
                setIngName("");
              }}
            >
              Add
            </Button>
          </div>
          {ingredients.length ? (
            <div className="flex flex-wrap gap-2">
              {ingredients.map((i) => (
                <span key={i.name} className="inline-flex items-center gap-2 border rounded px-2 py-1 text-sm">
                  {i.name}
                  <button
                    type="button"
                    className="text-red-600"
                    onClick={() => setIngredients(ingredients.filter((x) => x.name !== i.name))}
                    aria-label={`Remove ${i.name}`}
                    title="Remove"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create"}
        </Button>
      </form>

      {create.error && <p className="text-red-500">Error creating recipe</p>}
    </div>
  );
}
