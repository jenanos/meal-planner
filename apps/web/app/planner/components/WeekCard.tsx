"use client";
import { MagicCard } from "@repo/ui";
import type { DayName } from "../types";
import { dayBaseHsl, dayHoverGradients } from "../palette";
import { CategoryEmoji } from "../../components/CategoryEmoji";
//TODO: Add icons instead of text for category
export type Props = {
    index: number;
    dayName: DayName;
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
    isDraggingTarget?: boolean;

    // HTML5 DnD – gjør valgfrie
    onDrop?: React.DragEventHandler;
    onDragStart?: React.DragEventHandler;
    onDragOver?: React.DragEventHandler;
    onDragLeave?: React.DragEventHandler;
    onClick?: () => void;
};

export function WeekCard({
    dayName,
    recipe,
    isDraggingTarget,
    onDrop,
    onDragStart,
    onDragOver,
    onDragLeave,
    onClick,
}: Props) {
    // Palett og hover-gradienter fra felles palette-modul
    const baseHsl = dayBaseHsl[dayName];
    const dayGrad = dayHoverGradients[dayName];

    return (
        <MagicCard
            className={`rounded-lg flex h-full w-full items-center justify-center text-center`}
            style={{ ["--magic-card-bg" as any]: baseHsl }}
            gradientFrom={dayGrad.from}
            gradientTo={dayGrad.to}
            gradientColor={dayGrad.color}
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
                <div className="text-[11px] text-muted-foreground sm:text-xs">{dayName}</div>
                {recipe ? (
                    <div className="flex flex-col items-center justify-center space-y-0.5 sm:space-y-1.5">
                        <div className="break-words text-sm font-medium leading-tight">{recipe.name}</div>
                        {recipe.category ? <CategoryEmoji category={recipe.category as any} /> : null}
                    </div>
                ) : (
                    <div className="text-sm text-muted-foreground/60">Ingen valgt</div>
                )}
            </div>
        </MagicCard>
    );
}
