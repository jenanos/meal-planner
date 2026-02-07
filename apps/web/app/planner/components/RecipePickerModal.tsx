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

export type RecipePickerModalProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentEntry: WeekEntry | null;
    dayName: DayName;
    dayIndex: number;
    longGap: RecipeDTO[];
    frequent: RecipeDTO[];
    onSelectRecipe: (recipe: RecipeDTO, dayIndex: number) => void;
    onViewRecipe: (recipe: RecipeDTO) => void;
    onSetTakeaway: (dayIndex: number) => void;
    onClearEntry: (dayIndex: number) => void;
};

type TabValue = "frequent" | "longGap" | "all";

export function RecipePickerModal({
    open,
    onOpenChange,
    currentEntry,
    dayName,
    dayIndex,
    longGap,
    frequent,
    onSelectRecipe,
    onViewRecipe,
    onSetTakeaway,
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

    const currentRecipe = currentEntry?.type === "RECIPE" ? currentEntry.recipe : null;
    const isTakeaway = currentEntry?.type === "TAKEAWAY";

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

    // Get recipes based on active tab
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

    const tabs: { value: TabValue; label: string }[] = [
        { value: "frequent", label: "Ofte brukt" },
        { value: "longGap", label: "Lenge siden" },
        { value: "all", label: "Alle oppskrifter" },
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="h-[90vh] max-h-[90vh] flex flex-col p-0 gap-0">
                <DialogHeader className="p-4 pb-2 border-b shrink-0">
                    <DialogTitle className="text-center">
                        {dayName}
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
                    </DialogTitle>
                </DialogHeader>

                {/* Action buttons for current entry */}
                <div className="flex gap-2 px-4 py-2 border-b shrink-0">
                    {currentRecipe && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={handleViewRecipe}
                        >
                            Se oppskrift
                        </Button>
                    )}
                    {!isTakeaway && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 text-amber-700 border-amber-300 hover:bg-amber-50"
                            onClick={handleSetTakeaway}
                        >
                            Sett som takeaway
                        </Button>
                    )}
                    {(currentRecipe || isTakeaway) && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 text-red-600 border-red-300 hover:bg-red-50"
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
                        {activeTab === "all" && allRecipesQuery.isLoading ? (
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
