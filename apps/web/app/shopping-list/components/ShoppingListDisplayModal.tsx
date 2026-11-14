"use client";

import {
    Button,
    Dialog,
    DialogContent,
    DialogTitle,
    DialogClose,
    Label,
    Checkbox,
} from "@repo/ui";
import { X } from "lucide-react";
import type { ShoppingViewMode, ShoppingDisplayStyle } from "../../../lib/shopping";

export type ShoppingListDisplayModalProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    viewMode: ShoppingViewMode;
    setViewMode: (mode: ShoppingViewMode) => void;
    displayStyle: ShoppingDisplayStyle;
    setDisplayStyle: (style: ShoppingDisplayStyle) => void;
    showPantryWithIngredients: boolean;
    setShowPantryWithIngredients: (show: boolean) => void;
    stores: Array<{ id: string; name: string }>;
    selectedStoreId: string | null;
    setSelectedStoreId: (storeId: string) => void;
};

export function ShoppingListDisplayModal({
    open,
    onOpenChange,
    viewMode,
    setViewMode,
    displayStyle,
    setDisplayStyle,
    showPantryWithIngredients,
    setShowPantryWithIngredients,
    stores,
    selectedStoreId,
    setSelectedStoreId,
}: ShoppingListDisplayModalProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md w-full max-h-[85dvh] overflow-y-auto overscroll-contain p-0 gap-0">
                <div className="sticky top-0 z-10 bg-background p-4 pb-2 border-b flex flex-row items-center justify-between">
                    <DialogTitle>Visningsvalg</DialogTitle>
                    <DialogClose asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="-mr-2"
                            aria-label="Lukk"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </DialogClose>
                </div>

                <div className="p-4 space-y-5">
                        {/* View Mode */}
                        <div className="space-y-2">
                            <h3 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">
                                Visning
                            </h3>
                            <div className="grid grid-cols-3 gap-2">
                                <div
                                    className={`flex items-center space-x-2 border rounded-lg p-2 cursor-pointer transition-colors ${viewMode === "by-day" ? "border-primary bg-accent/50" : "hover:bg-accent"}`}
                                    onClick={() => setViewMode("by-day")}
                                >
                                    <div className={`h-4 w-4 rounded-full border border-primary flex items-center justify-center ${viewMode === "by-day" ? "bg-primary text-primary-foreground" : "opacity-50"}`}>
                                        {viewMode === "by-day" && <div className="h-2 w-2 rounded-full bg-current" />}
                                    </div>
                                    <Label className="flex-1 cursor-pointer text-sm">
                                        Ukesplan
                                    </Label>
                                </div>
                                <div
                                    className={`flex items-center space-x-2 border rounded-lg p-2 cursor-pointer transition-colors ${viewMode === "alphabetical" ? "border-primary bg-accent/50" : "hover:bg-accent"}`}
                                    onClick={() => setViewMode("alphabetical")}
                                >
                                    <div className={`h-4 w-4 rounded-full border border-primary flex items-center justify-center ${viewMode === "alphabetical" ? "bg-primary text-primary-foreground" : "opacity-50"}`}>
                                        {viewMode === "alphabetical" && <div className="h-2 w-2 rounded-full bg-current" />}
                                    </div>
                                    <Label className="flex-1 cursor-pointer text-sm">
                                        Alfabetisk
                                    </Label>
                                </div>
                                <div
                                    className={`flex items-center space-x-2 border rounded-lg p-2 cursor-pointer transition-colors ${viewMode === "by-category" ? "border-primary bg-accent/50" : "hover:bg-accent"}`}
                                    onClick={() => setViewMode("by-category")}
                                >
                                    <div className={`h-4 w-4 rounded-full border border-primary flex items-center justify-center ${viewMode === "by-category" ? "bg-primary text-primary-foreground" : "opacity-50"}`}>
                                        {viewMode === "by-category" && <div className="h-2 w-2 rounded-full bg-current" />}
                                    </div>
                                    <Label className="flex-1 cursor-pointer text-sm">
                                        Kategorier
                                    </Label>
                                </div>
                            </div>
                        </div>

                        {/* Display Style */}
                        <div className="space-y-2">
                            <h3 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">
                                Listeformat
                            </h3>
                            <div className="grid grid-cols-2 gap-2">
                                <div
                                    className={`flex items-center space-x-2 border rounded-lg p-2 cursor-pointer transition-colors ${displayStyle === "list" ? "border-primary bg-accent/50" : "hover:bg-accent"}`}
                                    onClick={() => setDisplayStyle("list")}
                                >
                                    <div className={`h-4 w-4 rounded-full border border-primary flex items-center justify-center ${displayStyle === "list" ? "bg-primary text-primary-foreground" : "opacity-50"}`}>
                                        {displayStyle === "list" && <div className="h-2 w-2 rounded-full bg-current" />}
                                    </div>
                                    <Label className="flex-1 cursor-pointer text-sm">
                                        Liste
                                    </Label>
                                </div>
                                <div
                                    className={`flex items-center space-x-2 border rounded-lg p-2 cursor-pointer transition-colors ${displayStyle === "grid" ? "border-primary bg-accent/50" : "hover:bg-accent"}`}
                                    onClick={() => setDisplayStyle("grid")}
                                >
                                    <div className={`h-4 w-4 rounded-full border border-primary flex items-center justify-center ${displayStyle === "grid" ? "bg-primary text-primary-foreground" : "opacity-50"}`}>
                                        {displayStyle === "grid" && <div className="h-2 w-2 rounded-full bg-current" />}
                                    </div>
                                    <Label className="flex-1 cursor-pointer text-sm">
                                        Rutenett
                                    </Label>
                                </div>
                            </div>
                        </div>

                        {/* Toggles */}
                        <div className="space-y-2">
                            <h3 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">
                                Innstillinger
                            </h3>
                            <div
                                className="flex items-center justify-between border rounded-lg p-2.5 cursor-pointer hover:bg-accent transition-colors"
                                onClick={() => setShowPantryWithIngredients(!showPantryWithIngredients)}
                            >
                                <Label className="flex-1 cursor-pointer pointer-events-none text-sm">
                                    Vis basisvarer med ingredienser
                                </Label>
                                <Checkbox
                                    className="h-4 w-4"
                                    checked={showPantryWithIngredients}
                                    onCheckedChange={(c) => setShowPantryWithIngredients(!!c)}
                                />
                            </div>
                        </div>

                        {viewMode === "by-category" && stores.length > 0 && (
                            <div className="space-y-2">
                                <h3 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">
                                    Butikk
                                </h3>
                                <select
                                    value={selectedStoreId ?? stores[0]?.id}
                                    onChange={(event) => setSelectedStoreId(event.target.value)}
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                >
                                    {stores.map((store) => (
                                        <option key={store.id} value={store.id}>
                                            {store.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                </div>

                <div className="sticky bottom-0 bg-background p-4 border-t">
                    <Button className="w-full" onClick={() => onOpenChange(false)}>
                        Ferdig
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
