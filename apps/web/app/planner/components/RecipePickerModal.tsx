"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    Button,
    Input,
    ScrollArea,
} from "@repo/ui";
import { trpc } from "../../../lib/trpcClient";
import type { DayName, RecipeDTO, WeekEntry } from "../types";
import { CategoryEmoji } from "../../components/CategoryEmoji";

type FreezerListItem = {
    id: string;
    recipeId: string;
    recipeName: string;
    recipeCategory: string;
    quantity: number;
};

export type RecipePickerModalProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentEntry: WeekEntry | null;
    dayName: DayName;
    dateLabel?: string;
    dayIndex: number;
    longGap: RecipeDTO[];
    frequent: RecipeDTO[];
    onSelectRecipe: (recipe: RecipeDTO, dayIndex: number) => void;
    onViewRecipe: (recipe: RecipeDTO) => void;
    onSetTakeaway: (dayIndex: number) => void;
    onSetFreezerMeal: (recipe: RecipeDTO, dayIndex: number) => void;
    onClearEntry: (dayIndex: number) => void;
};

type TabValue = "frequent" | "longGap" | "all" | "freezer";

export function RecipePickerModal({
    open,
    onOpenChange,
    currentEntry,
    dayName,
    dateLabel,
    dayIndex,
    longGap,
    frequent,
    onSelectRecipe,
    onViewRecipe,
    onSetTakeaway,
    onSetFreezerMeal,
    onClearEntry,
}: RecipePickerModalProps) {
    const [activeTab, setActiveTab] = useState<TabValue>("frequent");
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    // Debounce search term
    useEffect(() => {
        const timeout = setTimeout(() => {
            setDebouncedSearch(searchTerm);
        }, 300);
        return () => clearTimeout(timeout);
    }, [searchTerm]);

    // Reset state when modal opens
    useEffect(() => {
        if (open) {
            setActiveTab("frequent");
            setSearchTerm("");
            setDebouncedSearch("");
        }
    }, [open]);

    // Query for all recipes when "all" tab is active
    const allRecipesQuery = trpc.recipe.list.useQuery(
        { search: debouncedSearch || undefined, pageSize: 100 },
        { enabled: open && activeTab === "all" }
    );

    // Query for all recipes when "freezer" tab is active (to get full RecipeDTO)
    const freezerRecipesQuery = trpc.recipe.list.useQuery(
        { pageSize: 1000 },
        { enabled: open && activeTab === "freezer" }
    );

    // Query freezer items
    const freezerQuery = trpc.freezer.list.useQuery(undefined, {
        enabled: open,
    });
    const freezerItems: FreezerListItem[] = freezerQuery.data ?? [];

    const currentRecipe = currentEntry?.type === "RECIPE" ? currentEntry.recipe : (currentEntry?.type === "FREEZER" ? currentEntry.recipe : null);
    const isTakeaway = currentEntry?.type === "TAKEAWAY";
    const isFreezer = currentEntry?.type === "FREEZER";

    const handleSelectRecipe = useCallback(
        (recipe: RecipeDTO) => {
            onSelectRecipe(recipe, dayIndex);
            onOpenChange(false);
        },
        [onSelectRecipe, dayIndex, onOpenChange]
    );

    const handleSetTakeaway = useCallback(() => {
        onSetTakeaway(dayIndex);
        onOpenChange(false);
    }, [onSetTakeaway, dayIndex, onOpenChange]);

    const handleClearEntry = useCallback(() => {
        onClearEntry(dayIndex);
        onOpenChange(false);
    }, [onClearEntry, dayIndex, onOpenChange]);

    const handleViewRecipe = useCallback(() => {
        if (currentRecipe) {
            onViewRecipe(currentRecipe);
        }
    }, [currentRecipe, onViewRecipe]);

    // Get recipes based on active tab (not used for freezer tab)
    const displayRecipes = useMemo((): RecipeDTO[] => {
        switch (activeTab) {
            case "frequent":
                return frequent;
            case "longGap":
                return longGap;
            case "all":
                return (allRecipesQuery.data?.items ?? []) as RecipeDTO[];
            default:
                return [];
        }
    }, [activeTab, frequent, longGap, allRecipesQuery.data]);

    const handleSelectFreezerMeal = useCallback(
        (item: FreezerListItem) => {
            // Look up full RecipeDTO from the freezer recipes query
            const recipe = (freezerRecipesQuery.data?.items ?? []).find((r: any) => r.id === item.recipeId) as RecipeDTO | undefined;
            if (recipe) {
                onSetFreezerMeal(recipe, dayIndex);
            } else {
                // Fallback: create a minimal recipe object
                onSetFreezerMeal(
                    {
                        id: item.recipeId,
                        name: item.recipeName,
                        description: undefined,
                        category: item.recipeCategory,
                        everydayScore: 3,
                        healthScore: 3,
                        ingredients: [],
                        lastUsed: null,
                        usageCount: 0,
                    } as unknown as RecipeDTO,
                    dayIndex,
                );
            }
            onOpenChange(false);
        },
        [freezerRecipesQuery.data, onSetFreezerMeal, dayIndex, onOpenChange],
    );

    const tabs: { value: TabValue; label: string }[] = [
        { value: "frequent", label: "Ofte brukt" },
        { value: "longGap", label: "Lenge siden" },
        { value: "all", label: "Alle oppskrifter" },
        ...(freezerItems.length > 0 ? [{ value: "freezer" as TabValue, label: `Fryseren (${freezerItems.length})` }] : []),
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="h-[90vh] max-h-[90vh] max-w-[calc(100%-1rem)] sm:max-w-xl flex flex-col p-0 gap-0">
                <DialogHeader className="p-4 pb-2 border-b shrink-0">
                    <DialogTitle className="text-center">
                        {dayName} {dateLabel && <span className="font-normal opacity-75">{dateLabel}</span>}
                        {currentRecipe && (
                            <span className="block text-sm font-normal text-muted-foreground mt-1">
                                Nåværende: {currentRecipe.name}
                            </span>
                        )}
                        {isTakeaway && (
                            <span className="block text-sm font-normal text-amber-700 mt-1">
                                Nåværende: Takeaway
                            </span>
                        )}
                        {isFreezer && currentRecipe && (
                            <span className="block text-sm font-normal text-cyan-700 mt-1">
                                Nåværende: {currentRecipe.name} (fra fryseren)
                            </span>
                        )}
                    </DialogTitle>
                </DialogHeader>

                {/* Action buttons for current entry */}
                <div className="flex flex-wrap gap-2 px-4 py-2 border-b shrink-0">
                    {currentRecipe && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 min-w-0 whitespace-normal h-auto py-1.5 leading-tight"
                            onClick={handleViewRecipe}
                        >
                            Se oppskrift
                        </Button>
                    )}
                    {!isTakeaway && !isFreezer && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 min-w-0 whitespace-normal h-auto py-1.5 leading-tight text-amber-700 border-amber-300 hover:bg-amber-50"
                            onClick={handleSetTakeaway}
                        >
                            Sett som takeaway
                        </Button>
                    )}
                    {(currentRecipe || isTakeaway || isFreezer) && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 min-w-0 whitespace-normal h-auto py-1.5 leading-tight text-red-600 border-red-300 hover:bg-red-50"
                            onClick={handleClearEntry}
                        >
                            Fjern
                        </Button>
                    )}
                </div>

                {/* Tab navigation */}
                <div className="flex border-b shrink-0">
                    {tabs.map((tab) => (
                        <button
                            key={tab.value}
                            type="button"
                            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${activeTab === tab.value
                                ? "border-b-2 border-primary text-primary"
                                : "text-muted-foreground hover:text-foreground"
                                }`}
                            onClick={() => setActiveTab(tab.value)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Search (only for "all" tab) */}
                {activeTab === "all" && (
                    <div className="px-4 py-2 border-b shrink-0">
                        <Input
                            placeholder="Søk etter oppskrifter..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full"
                        />
                    </div>
                )}

                {/* Recipe list */}
                <ScrollArea className="flex-1 min-h-0">
                    <div className="p-4 space-y-2">
                        {activeTab === "freezer" ? (
                            freezerItems.length === 0 ? (
                                <p className="text-center text-muted-foreground py-8">
                                    Fryseren er tom
                                </p>
                            ) : (
                                freezerItems.map((item) => (
                                    <button
                                        key={item.recipeId}
                                        type="button"
                                        className="w-full flex items-center gap-3 p-3 rounded-lg bg-cyan-50 hover:bg-cyan-100 transition-colors text-left"
                                        onClick={() => handleSelectFreezerMeal(item)}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium truncate">{item.recipeName}</div>
                                            <div className="text-xs text-cyan-700">
                                                {item.quantity} {item.quantity === 1 ? "porsjon" : "porsjoner"} i fryseren
                                            </div>
                                        </div>
                                        {item.recipeCategory && (
                                            <CategoryEmoji category={item.recipeCategory as any} />
                                        )}
                                    </button>
                                ))
                            )
                        ) : activeTab === "all" && allRecipesQuery.isLoading ? (
                            <p className="text-center text-muted-foreground py-8">Laster oppskrifter...</p>
                        ) : displayRecipes.length === 0 ? (
                            <p className="text-center text-muted-foreground py-8">
                                {activeTab === "all" && searchTerm
                                    ? "Ingen oppskrifter funnet"
                                    : "Ingen forslag"}
                            </p>
                        ) : (
                            displayRecipes.map((recipe) => (
                                <button
                                    key={recipe.id}
                                    type="button"
                                    className="w-full flex items-center gap-3 p-3 rounded-lg bg-accent/50 hover:bg-accent transition-colors text-left"
                                    onClick={() => handleSelectRecipe(recipe)}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium truncate">{recipe.name}</div>
                                        {recipe.lastUsed && (
                                            <div className="text-xs text-muted-foreground">
                                                Sist brukt: {new Date(recipe.lastUsed).toLocaleDateString("nb-NO")}
                                            </div>
                                        )}
                                    </div>
                                    {recipe.category && (
                                        <CategoryEmoji category={recipe.category as any} />
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                </ScrollArea>

                {/* Close button */}
                <div className="p-4 border-t shrink-0">
                    <Button
                        variant="ghost"
                        className="w-full"
                        onClick={() => onOpenChange(false)}
                    >
                        Avbryt
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
