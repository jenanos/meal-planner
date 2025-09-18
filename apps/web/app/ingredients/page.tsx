"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { trpc } from "../../lib/trpcClient";
import { Button } from "@repo/ui";

export default function IngredientsPage() {
    const [search, setSearch] = useState("");
    const [name, setName] = useState("");
    const [unit, setUnit] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const list = trpc.ingredient.list.useQuery({ search: search || undefined });
    const create = trpc.ingredient.create.useMutation({
        onSuccess: () => {
            setName("");
            setUnit("");
            list.refetch();
        },
    });
    const detail = trpc.ingredient.getWithRecipes.useQuery(
        { id: selectedId! },
        { enabled: !!selectedId }
    );

    return (
        <div className="space-y-6">
            <h1 className="text-xl font-bold">Ingredients</h1>

            <div className="flex gap-2 items-end">
                <div className="flex flex-col">
                    <label className="text-sm">Search</label>
                    <input className="border px-2 py-1" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <Button type="button" onClick={() => list.refetch()}>
                    Filter
                </Button>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                <div>
                    <h2 className="font-semibold mb-2">All ingredients</h2>
                    <ul className="divide-y border rounded">
                        {(list.data ?? []).map((i: any) => (
                            <li key={i.id} className="p-2 flex justify-between items-center">
                                <button
                                    className="text-left hover:underline"
                                    onClick={() => setSelectedId(i.id)}
                                >
                                    {i.name} {i.unit ? <span className="text-xs text-gray-500">({i.unit})</span> : null}
                                </button>
                                <span className="text-xs text-gray-500">{i.usageCount} recipes</span>
                            </li>
                        ))}
                        {!list.data?.length && (
                            <li className="p-2 text-sm text-gray-500">No ingredients</li>
                        )}
                    </ul>

                    <form
                        className="mt-4 flex gap-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (!name.trim()) return;
                            create.mutate({ name, unit: unit || undefined });
                        }}
                    >
                        <input
                            className="border px-2 py-1 flex-1"
                            placeholder="Name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                        <input
                            className="border px-2 py-1 w-32"
                            placeholder="Unit"
                            value={unit}
                            onChange={(e) => setUnit(e.target.value)}
                        />
                        <Button type="submit" disabled={create.isPending}>
                            {create.isPending ? "Adding…" : "Add"}
                        </Button>
                    </form>
                </div>

                <div>
                    <h2 className="font-semibold mb-2">Recipes using selected</h2>
                    {!selectedId && <p className="text-sm text-gray-500">Select an ingredient</p>}
                    {selectedId && detail.isLoading && <p>Loading…</p>}
                    {selectedId && detail.data && (
                        <div className="space-y-2">
                            <div className="text-sm">
                                <span className="font-medium">{detail.data.name}</span>{" "}
                                {detail.data.unit ? (
                                    <span className="text-gray-500">({detail.data.unit})</span>
                                ) : null}
                            </div>
                            <ul className="list-disc pl-6">
                                {detail.data.recipes.map((r: any) => (
                                    <li key={r.id}>
                                        {r.name}{" "}
                                        <span className="text-xs text-gray-500">({r.category})</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}