"use client";
export const dynamic = "force-dynamic";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { trpc } from "../../lib/trpcClient";
import { Badge, Button, Checkbox, Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input, ScrollArea } from "@repo/ui";
import type { MockIngredientDetailResult, MockIngredientListResult } from "../../lib/mock/store";
import { IngredientCard } from "./components/IngredientCard";
import { X } from "lucide-react";

type IngredientListItem = MockIngredientListResult[number];
type IngredientRecipe = MockIngredientDetailResult["recipes"][number];

export default function IngredientsPage() {
    const [search, setSearch] = useState("");
    const deferredSearch = useDeferredValue(search);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
    const [viewIngredientId, setViewIngredientId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [unit, setUnit] = useState("");
    const [debouncedName, setDebouncedName] = useState("");
    const [isPantryItem, setIsPantryItem] = useState(false);

    const list = trpc.ingredient.list.useQuery({ search: deferredSearch.trim() || undefined });
    // Debounce dialog "name" for suggestions
    useEffect(() => {
        const t = setTimeout(() => setDebouncedName(name), 250);
        return () => clearTimeout(t);
    }, [name]);
    // Suggestions for the dialog input
    const dialogSuggest = trpc.ingredient.list.useQuery(
        { search: debouncedName.trim() || undefined },
        { enabled: debouncedName.trim().length > 0, staleTime: 5_000 }
    );

    const resetForm = () => {
        setName("");
        setUnit("");
        setIsPantryItem(false);
        setEditingId(null);
    };

    const create = trpc.ingredient.create.useMutation({
        onSuccess: () => {
            list.refetch();
            setIsDialogOpen(false);
            resetForm();
        },
    });

    const update = trpc.ingredient.update.useMutation({
        onSuccess: (_data: unknown, variables: { id: string }) => {
            list.refetch();
            setIsDialogOpen(false);
            const nextId = variables.id;
            resetForm();
            if (nextId) {
                setViewIngredientId(nextId);
                setIsViewDialogOpen(true);
            }
        },
    });

    const viewDetail = trpc.ingredient.getWithRecipes.useQuery(
        { id: viewIngredientId! },
        { enabled: !!viewIngredientId }
    );

    const startEditing = () => {
        const data = viewDetail.data;
        if (!data) return;
        setEditingId(data.id);
        setName(data.name);
        setUnit(data.unit ?? "");
        setIsPantryItem(data.isPantryItem);
        setIsDialogOpen(true);
        setIsViewDialogOpen(false);
    };

    const isEditMode = editingId !== null;
    const activeMutation = isEditMode ? update : create;
    const isSubmitting = activeMutation.isPending;
    const actionLabel = isEditMode ? (isSubmitting ? "Oppdaterer…" : "Oppdater") : isSubmitting ? "Legger til…" : "Legg til";

    const items: IngredientListItem[] = list.data ?? [];
    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return items;
        return items.filter((item) => item.name.toLowerCase().includes(term));
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
                    onClick={() => {
                        resetForm();
                        setIsDialogOpen(true);
                    }}
                    type="button"
                >
                    Legg til ingrediens
                </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 justify-items-center xl:min-w-[840px]">
                {filtered.map((i, idx) => (
                    <IngredientCard
                        key={i.id}
                        ingredient={{ id: i.id, name: i.name, unit: i.unit, usageCount: i.usageCount, isPantryItem: i.isPantryItem }}
                        index={idx}
                        selected={i.id === viewIngredientId}
                        onClick={() => {
                            setViewIngredientId(i.id);
                            setIsViewDialogOpen(true);
                        }}
                    />
                ))}
                {!filtered.length && (
                    <div className="col-span-full text-sm text-muted-foreground">Ingen ingredienser</div>
                )}
            </div>

            <Dialog
                open={isViewDialogOpen}
                onOpenChange={(open) => {
                    setIsViewDialogOpen(open);
                    if (!open) {
                        setViewIngredientId(null);
                    }
                }}
            >
                <DialogContent className="isolate z-[2000] bg-white dark:bg-neutral-900 text-foreground max-sm:w-[calc(100vw-2rem)] max-sm:mx-auto sm:max-w-lg sm:max-h-[min(100vh-4rem,32rem)] sm:shadow-2xl sm:ring-1 sm:ring-border sm:rounded-xl max-sm:bg-background max-sm:!left-1/2 max-sm:!top-[calc(env(safe-area-inset-top)+1rem)] max-sm:!h-[50dvh] max-sm:!max-h-[50dvh] max-sm:!-translate-x-1/2 max-sm:!translate-y-0 max-sm:!rounded-2xl max-sm:!border-0 max-sm:!shadow-none max-sm:p-6">
                    <div className="flex h-full min-h-0 flex-col gap-4 max-sm:pt-[env(safe-area-inset-top)] max-sm:pb-[env(safe-area-inset-bottom)]">
                        <DialogHeader className="sm:px-0 sm:pt-0">
                            <div className="mb-3 flex items-start justify-between gap-4">
                                <div className="space-y-2">
                                    <DialogTitle className="leading-tight">
                                        {viewDetail.data?.name ?? "Ingrediens"}
                                    </DialogTitle>
                                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                        {viewDetail.data?.unit ? <span>Enhet: {viewDetail.data.unit}</span> : null}
                                        {viewDetail.data?.isPantryItem ? (
                                            <Badge variant="outline" className="text-xs uppercase tracking-wide">
                                                Basisvare
                                            </Badge>
                                        ) : null}
                                    </div>
                                </div>
                                <DialogClose asChild>
                                    <Button type="button" variant="ghost" size="icon" aria-label="Lukk">
                                        <X className="size-4" />
                                    </Button>
                                </DialogClose>
                            </div>
                            <DialogDescription className="max-sm:hidden">
                                Oversikt over hvilke oppskrifter som bruker ingrediensen.
                            </DialogDescription>
                        </DialogHeader>

                        {viewDetail.isLoading ? <p>Laster…</p> : null}
                        {viewDetail.error ? (
                            <p className="text-sm text-destructive">
                                Kunne ikke laste ingrediensen. Prøv igjen senere.
                            </p>
                        ) : null}
                        {viewDetail.data ? (
                            <div className="space-y-4">
                                <div>
                                    <h3 className="text-sm font-medium">Oppskrifter</h3>
                                    {viewDetail.data.recipes.length ? (
                                        <ScrollArea className="mt-2 max-h-64 pr-2">
                                            <ul className="space-y-2 pr-1">
                                                {viewDetail.data.recipes.map((recipe: IngredientRecipe) => (
                                                    <li key={recipe.id} className="text-sm">
                                                        <span className="font-medium">{recipe.name}</span>{" "}
                                                        {recipe.category ? (
                                                            <span className="text-xs text-muted-foreground">({recipe.category})</span>
                                                        ) : null}
                                                    </li>
                                                ))}
                                            </ul>
                                        </ScrollArea>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">
                                            Ingen oppskrifter bruker denne ingrediensen ennå.
                                        </p>
                                    )}
                                </div>
                                <div className="flex justify-end">
                                    <Button type="button" onClick={startEditing} disabled={!viewDetail.data}>
                                        Endre ingrediens
                                    </Button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog
                open={isDialogOpen}
                onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) {
                        resetForm();
                    }
                }}
            >
                <DialogContent className="isolate z-[2000] bg-white dark:bg-neutral-900 text-foreground max-sm:w-[calc(100vw-2rem)] max-sm:mx-auto sm:max-w-md sm:max-h-[min(100vh-4rem,32rem)] sm:shadow-2xl sm:ring-1 sm:ring-border sm:rounded-xl max-sm:bg-background max-sm:!left-1/2 max-sm:!top-[calc(env(safe-area-inset-top)+1rem)] max-sm:!h-[50dvh] max-sm:!max-h-[50dvh] max-sm:!-translate-x-1/2 max-sm:!translate-y-0 max-sm:!rounded-2xl max-sm:!border-0 max-sm:!shadow-none max-sm:p-6">
                    <div className="flex h-full min-h-0 flex-col max-sm:pt-[env(safe-area-inset-top)] max-sm:pb-[env(safe-area-inset-bottom)]">
                        <DialogHeader className="sm:px-0 sm:pt-0">
                            <div className="mb-3 flex items-center justify-between">
                                <Button
                                    type="submit"
                                    form="ingredient-form"
                                    size="sm"
                                    disabled={isSubmitting || !name.trim()}
                                >
                                    {actionLabel}
                                </Button>
                                <DialogClose asChild>
                                    <Button type="button" variant="ghost" size="icon" aria-label="Lukk">
                                        <X className="size-4" />
                                    </Button>
                                </DialogClose>
                            </div>
                            <DialogTitle>{isEditMode ? "Oppdater ingrediens" : "Ny ingrediens"}</DialogTitle>
                            <DialogDescription className="max-sm:hidden">
                                {isEditMode ? "Oppdater informasjon om ingrediensen." : "Legg til en ny ingrediens i databasen."}
                            </DialogDescription>
                        </DialogHeader>
                        <form
                            id="ingredient-form"
                            className="space-y-3 max-sm:flex-1 max-sm:overflow-y-auto max-sm:overflow-x-visible"
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (!name.trim()) return;
                                const payload = { name: name.trim(), unit: unit.trim() || undefined, isPantryItem };
                                if (isEditMode && editingId) {
                                    update.mutate({ id: editingId, ...payload });
                                } else {
                                    create.mutate(payload);
                                }
                            }}
                        >
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <div className="sm:col-span-2">
                                    <label className="text-sm">Navn</label>
                                    <Input className="focus-visible:ring-inset" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                                    {name.trim().length > 0 ? (
                                        <div className="mt-2 space-y-2">
                                            {dialogSuggest.isFetching ? (
                                                <p className="text-xs text-muted-foreground">Søker…</p>
                                            ) : null}
                                            {(() => {
                                                const suggestions: IngredientListItem[] = dialogSuggest.data ?? [];
                                                const lowered = name.trim().toLowerCase();
                                                const hasExact = suggestions.some((s) => s.name.toLowerCase() === lowered);
                                                if (suggestions.length === 0 && !hasExact) {
                                                    return (
                                                        <Badge className="cursor-pointer" onClick={() => setName(name.trim())}>
                                                            Legg til "{name.trim()}"
                                                        </Badge>
                                                    );
                                                }
                                                return (
                                                    <ScrollArea className="max-h-32 pr-2">
                                                        <div className="flex flex-wrap gap-2 pb-2">
                                                              {suggestions.map((s: IngredientListItem) => (
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
                                                            {!hasExact && (
                                                                <Badge className="cursor-pointer" onClick={() => setName(name.trim())}>
                                                                    Legg til "{name.trim()}"
                                                                </Badge>
                                                            )}
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
                                <div className="sm:col-span-3 flex items-center gap-2">
                                    <Checkbox id="is-pantry" checked={isPantryItem} onCheckedChange={(checked) => setIsPantryItem(Boolean(checked))} />
                                    <label htmlFor="is-pantry" className="text-sm select-none">
                                        Marker som basisvare
                                    </label>
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