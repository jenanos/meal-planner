"use client";
import { MagicCard } from "@repo/ui";
import type { DayName } from "../types";
import { dayBaseHsl, dayHoverGradients } from "../palette";
import { CategoryEmoji } from "../../components/CategoryEmoji";
//TODO: Add icons instead of text for category
export type Props = {
    index: number;
    dayName: DayName;
    dateLabel?: string;
    recipe: {
        id: string;
        name: string;
        category: string;
        everydayScore: number;
        healthScore: number;
        ingredients: any[];
        lastUsed: string | null;
        usageCount: number;
    } | null;
    entryType?: "RECIPE" | "TAKEAWAY" | "EMPTY";
    isDraggingTarget?: boolean;

    // HTML5 DnD – gjør valgfrie
    onDrop?: React.DragEventHandler;
    onDragStart?: React.DragEventHandler;
    onDragOver?: React.DragEventHandler;
    onDragLeave?: React.DragEventHandler;
    onClick?: () => void;
    onSetTakeaway?: () => void;
    onClearEntry?: () => void;
};

export function WeekCard({
    dayName,
    dateLabel,
    recipe,
    entryType = recipe ? "RECIPE" : "EMPTY",
    isDraggingTarget,
    onDrop,
    onDragStart,
    onDragOver,
    onDragLeave,
    onClick,
    onSetTakeaway,
    onClearEntry,
}: Props) {
    // Palett og hover-gradienter fra felles palette-modul
    const baseHsl = dayBaseHsl[dayName];
    const dayGrad = dayHoverGradients[dayName];
    const isTakeaway = entryType === "TAKEAWAY";
    const isEmpty = entryType === "EMPTY";

    return (
        <MagicCard
            className={`rounded-lg flex h-full w-full items-center justify-center text-center`}
            style={{ ["--magic-card-bg" as any]: isTakeaway ? "36 100% 94%" : baseHsl }}
            gradientFrom={isTakeaway ? "#FB923C" : dayGrad.from}
            gradientTo={isTakeaway ? "#FDE68A" : dayGrad.to}
            gradientColor={isTakeaway ? "#F97316" : dayGrad.color}
            gradientOpacity={isDraggingTarget ? 0.7 : 0.5}
            gradientSize={320}
            draggable={!!onDragStart}
            onDragStart={(e) => { onDragStart?.(e); }}
            onDragOver={(e) => { e.preventDefault(); onDragOver?.(e); }}
            onDragLeave={(e) => { onDragLeave?.(e); }}
            onDrop={(e) => { e.preventDefault(); onDrop?.(e); }}
            onClick={onClick}
            role={onClick ? "button" : undefined}
            tabIndex={onClick ? 0 : undefined}
            onKeyDown={
                onClick
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onClick();
                        }
                    }
                    : undefined
            }
        >
            <div className="flex h-full min-h-[128px] flex-col items-center justify-center gap-1 p-2.5 text-center sm:min-h-[160px] sm:p-4 sm:gap-2">
                <div className="text-[11px] text-muted-foreground sm:text-xs">
                    {dayName} {dateLabel && <span className="opacity-75 font-normal ml-0.5">{dateLabel}</span>}
                </div>
                {recipe ? (
                    <div className="flex flex-col items-center justify-center space-y-0.5 sm:space-y-1.5">
                        <div className="break-words text-sm font-medium leading-tight">{recipe.name}</div>
                        {recipe.category ? <CategoryEmoji category={recipe.category as any} /> : null}
                    </div>
                ) : isTakeaway ? (
                    <div className="flex flex-col items-center justify-center space-y-1">
                        <div className="break-words text-sm font-semibold text-amber-800">Takeaway / spise borte</div>
                        <div className="text-[11px] text-amber-700">Ingen ingredienser legges til</div>
                    </div>
                ) : (
                    <div className="text-sm text-muted-foreground/60">Ingen valgt</div>
                )}
                {entryType === "RECIPE" && onSetTakeaway ? (
                    <button
                        type="button"
                        className="mt-1 rounded-md border border-amber-300/70 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-800 hover:bg-amber-100"
                        onClick={(event) => {
                            event.stopPropagation();
                            onSetTakeaway();
                        }}
                    >
                        Bytt til takeaway
                    </button>
                ) : null}
                {isEmpty && onSetTakeaway ? (
                    <button
                        type="button"
                        className="mt-1 rounded-md border border-amber-300/70 bg-amber-100/60 px-2 py-1 text-[10px] font-medium text-amber-800 hover:bg-amber-100"
                        onClick={(event) => {
                            event.stopPropagation();
                            onSetTakeaway();
                        }}
                    >
                        Marker som takeaway
                    </button>
                ) : null}
                {isTakeaway && onClearEntry ? (
                    <button
                        type="button"
                        className="mt-1 rounded-md border border-amber-400/70 bg-white/60 px-2 py-1 text-[10px] font-medium text-amber-900 hover:bg-white"
                        onClick={(event) => {
                            event.stopPropagation();
                            onClearEntry();
                        }}
                    >
                        Fjern
                    </button>
                ) : null}
            </div>
        </MagicCard>
    );
}
