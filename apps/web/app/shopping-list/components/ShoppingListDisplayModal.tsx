"use client";

import {
    Button,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogClose,
    Label,
    Checkbox,
    ScrollArea,
} from "@repo/ui";
import { X } from "lucide-react";
import { ALL_DAY_NAMES } from "../../planner/utils";

export type ShoppingListDisplayModalProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    viewMode: "by-day" | "alphabetical";
    setViewMode: (mode: "by-day" | "alphabetical") => void;
    startDay: number;
    setStartDay: (day: number) => void;
    includeNextWeek: boolean;
    setIncludeNextWeek: (include: boolean) => void;
    showPantryWithIngredients: boolean;
    setShowPantryWithIngredients: (show: boolean) => void;
    occurrenceOptions: Array<{
        key: string;
        weekdayLabel: string;
        shortLabel: string;
    }>;
    visibleDayKeys: string[];
    toggleDayKey: (key: string, checked: boolean) => void;
    setVisibleDayKeys: (keys: string[]) => void;
};

export function ShoppingListDisplayModal({
    open,
    onOpenChange,
    viewMode,
    setViewMode,
    startDay,
    setStartDay,
    includeNextWeek,
    setIncludeNextWeek,
    showPantryWithIngredients,
    setShowPantryWithIngredients,
    occurrenceOptions,
    visibleDayKeys,
    toggleDayKey,
    setVisibleDayKeys,
}: ShoppingListDisplayModalProps) {
    const visibleDayKeySet = new Set(visibleDayKeys);

    const toggleAllDays = (checked: boolean) => {
        if (checked) {
            const allKeys = occurrenceOptions.map((o) => o.key);
            setVisibleDayKeys(allKeys);
        } else {
            setVisibleDayKeys([]);
        }
    };

    const allDaysChecked =
        occurrenceOptions.length > 0 &&
        visibleDayKeys.length === occurrenceOptions.length;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md w-full max-h-[90vh] flex flex-col p-0 gap-0">
                <div className="p-4 pb-2 border-b shrink-0 flex flex-row items-center justify-between">
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

                <ScrollArea className="flex-1 min-h-0">
                    <div className="p-4 space-y-5">
                        {/* View Mode */}
                        <div className="space-y-2">
                            <h3 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">
                                Visning
                            </h3>
                            <div className="grid grid-cols-2 gap-2">
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
                            </div>
                        </div>

                        {/* Start Day */}
                        <div className="space-y-2">
                            <h3 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">
                                Startuke på
                            </h3>
                            <div className="grid grid-cols-7 gap-1">
                                {ALL_DAY_NAMES.map((name, i) => (
                                    <Button
                                        key={i}
                                        variant={startDay === i ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setStartDay(i)}
                                        className="h-7 px-0 text-[10px] w-full"
                                    >
                                        {name.substring(0, 3)}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        {/* Toggles */}
                        <div className="space-y-2">
                            <h3 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">
                                Innstillinger
                            </h3>
                            <div
                                className="flex items-center justify-between border rounded-lg p-2.5 cursor-pointer hover:bg-accent transition-colors"
                                onClick={() => setIncludeNextWeek(!includeNextWeek)}
                            >
                                <Label className="flex-1 cursor-pointer pointer-events-none text-sm">
                                    Inkluder neste uke
                                </Label>
                                <Checkbox
                                    className="h-4 w-4"
                                    checked={includeNextWeek}
                                    onCheckedChange={(c) => setIncludeNextWeek(!!c)}
                                />
                            </div>
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

                        {/* Day Filter (only if viewMode is by-day) */}
                        {viewMode === "by-day" && occurrenceOptions.length > 0 && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">
                                        Velg dager
                                    </h3>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-auto py-0 px-2 text-[10px]"
                                        onClick={() => toggleAllDays(!allDaysChecked)}
                                    >
                                        {allDaysChecked ? "Fjern alle" : "Velg alle"}
                                    </Button>
                                </div>
                                <div className="grid grid-cols-3 gap-1.5">
                                    {occurrenceOptions.map((option) => {
                                        const isSelected = visibleDayKeySet.has(option.key);
                                        return (
                                            <div
                                                key={option.key}
                                                onClick={() =>
                                                    toggleDayKey(option.key, !isSelected)
                                                }
                                                className={`flex items-center justify-center px-1 py-1.5 rounded-md border text-[11px] cursor-pointer transition-colors ${isSelected
                                                        ? "bg-primary/10 border-primary text-primary font-medium"
                                                        : "bg-transparent border-input hover:bg-accent text-foreground"
                                                    }`}
                                            >
                                                <span className="truncate">
                                                    {option.weekdayLabel.substring(0, 3)} {option.shortLabel}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </ScrollArea>

                <div className="p-4 border-t shrink-0">
                    <Button className="w-full" onClick={() => onOpenChange(false)}>
                        Ferdig
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
