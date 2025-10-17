"use client";
export const dynamic = "force-dynamic";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { trpc } from "../../lib/trpcClient";
import { Badge, Button, Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input, ScrollArea } from "@repo/ui";
import { IngredientCard } from "./components/IngredientCard";
import { X } from "lucide-react";

export default function IngredientsPage() {
    const [search, setSearch] = useState("");
    const deferredSearch = useDeferredValue(search);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [name, setName] = useState("");
    const [unit, setUnit] = useState("");
    const [debouncedName, setDebouncedName] = useState("");

    const list = trpc.ingredient.list.useQuery({ search: deferredSearch.trim() || undefined });
    // Debounce dialog "name" for suggestions
    useEffect(() => {
        const t = setTimeout(() => setDebouncedName(name), 250);
        return () => clearTimeout(t);
    }, [name]);
    // Suggestions for the dialog input
    const dialogSuggest = trpc.ingredient.list.useQuery(
        { search: debouncedName.trim() || undefined },
        { enabled: name.trim().length > 0, staleTime: 5_000 }
    );
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
            <h1 className="text-xl font-bold text-center">Ingredienser</h1>
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
                <DialogContent className="isolate z-[2000] bg-white dark:bg-neutral-900 text-foreground max-sm:w-[calc(100vw-2rem)] max-sm:mx-auto sm:max-w-md sm:max-h-[min(100vh-4rem,32rem)] sm:shadow-2xl sm:ring-1 sm:ring-border sm:rounded-xl max-sm:bg-background max-sm:!left-1/2 max-sm:!top-[calc(env(safe-area-inset-top)+1rem)] max-sm:!h-[50dvh] max-sm:!max-h-[50dvh] max-sm:!-translate-x-1/2 max-sm:!translate-y-0 max-sm:!rounded-2xl max-sm:!border-0 max-sm:!shadow-none max-sm:p-6">
                    <div className="flex h-full min-h-0 flex-col max-sm:pt-[env(safe-area-inset-top)] max-sm:pb-[env(safe-area-inset-bottom)]">
                        <DialogHeader className="sm:px-0 sm:pt-0">
                            <div className="mb-3 flex items-center justify-between">
                                <Button
                                    type="submit"
                                    form="ingredient-form"
                                    size="sm"
                                    disabled={create.isPending || !name.trim()}
                                >
                                    {create.isPending ? "Legger til…" : "Legg til"}
                                </Button>
                                <DialogClose asChild>
                                    <Button type="button" variant="ghost" size="icon" aria-label="Lukk">
                                        <X className="size-4" />
                                    </Button>
                                </DialogClose>
                            </div>
                            <DialogTitle>Ny ingrediens</DialogTitle>
                            <DialogDescription className="max-sm:hidden">Legg til en ny ingrediens i databasen.</DialogDescription>
                        </DialogHeader>
                        <form
                            id="ingredient-form"
                            className="space-y-3 max-sm:flex-1 max-sm:overflow-y-auto max-sm:overflow-x-visible"
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (!name.trim()) return;
                                create.mutate({ name: name.trim(), unit: unit.trim() || undefined });
                            }}
                        >
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <div className="sm:col-span-2">
                                    <label className="text-sm">Navn</label>
                                    <Input className="focus-visible:ring-inset" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                                    {name.trim().length > 0 ? (
                                        <div className="mt-2 space-y-2">
                                            {dialogSuggest.isLoading ? (
                                                <p className="text-xs text-muted-foreground">Søker…</p>
                                            ) : null}
                                            {(() => {
                                                const suggestions = dialogSuggest.data ?? [];
                                                if (suggestions.length === 0) return null;
                                                return (
                                                    <ScrollArea className="max-h-32 pr-2">
                                                        <div className="flex flex-wrap gap-2 pb-2">
                                                            {suggestions.map((s: any) => (
                                                                <Badge
                                                                    key={s.id}
                                                                    className="cursor-pointer"
                                                                    onClick={() => {
                                                                        setName(s.name);
                                                                        if (s.unit) setUnit(s.unit);
                                                                    }}
                                                                >
                                                                    {s.name}
                                                                    {s.unit ? <span className="opacity-60">&nbsp;({s.unit})</span> : null}
                                                                </Badge>
                                                            ))}
                                                        </div>
                                                    </ScrollArea>
                                                );
                                            })()}
                                        </div>
                                    ) : null}
                                </div>
                                <div>
                                    <label className="text-sm">Enhet</label>
                                    <Input className="focus-visible:ring-inset" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="f.eks. g, ml, stk" />
                                </div>
                            </div>
                            {/* Footer removed: primary action sits in header */}
                        </form>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}