"use client";
export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import { trpc } from "../../lib/trpcClient";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, ScrollArea } from "@repo/ui";
import { IngredientCard } from "./components/IngredientCard";

export default function IngredientsPage() {
    const [search, setSearch] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [name, setName] = useState("");
    const [unit, setUnit] = useState("");

    const list = trpc.ingredient.list.useQuery({ search: undefined });
    const create = trpc.ingredient.create.useMutation({
        onSuccess: () => {
            setName("");
            setUnit("");
            setIsDialogOpen(false);
            list.refetch();
        },
    });
    const detail = trpc.ingredient.getWithRecipes.useQuery(
        { id: selectedId! },
        { enabled: !!selectedId }
    );

    const items = list.data ?? [];
    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return items;
        return items.filter((i) => `${i.name} ${i.unit ?? ""}`.toLowerCase().includes(term));
    }, [items, search]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div className="flex-1 max-w-md">
                    <Input
                        placeholder="Søk etter ingredienser"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="min-w-[12rem]"
                    onClick={() => setIsDialogOpen(true)}
                    type="button"
                >
                    Legg til ingrediens
                </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 justify-items-center xl:min-w-[840px]">
                {filtered.map((i, idx) => (
                    <IngredientCard
                        key={i.id}
                        ingredient={{ id: i.id, name: i.name, unit: i.unit, usageCount: i.usageCount }}
                        index={idx}
                        selected={i.id === selectedId}
                        onClick={() => setSelectedId(i.id)}
                    />
                ))}
                {!filtered.length && (
                    <div className="col-span-full text-sm text-muted-foreground">Ingen ingredienser</div>
                )}
            </div>

            <div className="rounded-lg border p-4">
                <h2 className="font-semibold mb-2">Oppskrifter med valgt ingrediens</h2>
                {!selectedId && <p className="text-sm text-muted-foreground">Velg en ingrediens</p>}
                {selectedId && detail.isLoading && <p>Laster…</p>}
                {selectedId && detail.data && (
                    <div className="space-y-2">
                        <div className="text-sm">
                            <span className="font-medium">{detail.data.name}</span>{" "}
                            {detail.data.unit ? (
                                <span className="text-muted-foreground">({detail.data.unit})</span>
                            ) : null}
                        </div>
                        <ScrollArea className="max-h-64 pr-2">
                            <ul className="list-disc pl-6">
                                {detail.data.recipes.map((r: any) => (
                                    <li key={r.id}>
                                        {r.name} {r.category ? <span className="text-xs text-muted-foreground">({r.category})</span> : null}
                                    </li>
                                ))}
                            </ul>
                        </ScrollArea>
                    </div>
                )}
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="isolate z-[2000] bg-white dark:bg-neutral-900 text-foreground ring-1 ring-border rounded-xl p-6 shadow-2xl sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Ny ingrediens</DialogTitle>
                        <DialogDescription>Legg til en ny ingrediens i databasen.</DialogDescription>
                    </DialogHeader>
                    <form
                        className="space-y-3"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (!name.trim()) return;
                            create.mutate({ name: name.trim(), unit: unit.trim() || undefined });
                        }}
                    >
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="sm:col-span-2">
                                <label className="text-sm">Navn</label>
                                <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                            </div>
                            <div>
                                <label className="text-sm">Enhet</label>
                                <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="f.eks. g, ml, stk" />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="submit" disabled={create.isPending}>{create.isPending ? "Legger til…" : "Legg til"}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}