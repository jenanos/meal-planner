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
};

export function WeekCard({
    dayName,
    recipe,
    isDraggingTarget,
    onDrop,
    onDragStart,
    onDragOver,
    onDragLeave,
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
        >
            <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 p-4 text-center">
                <div className="text-xs text-muted-foreground">{dayName}</div>
                {recipe ? (
                    <div className="space-y-1 flex flex-col items-center justify-center">
                        <div className="font-medium break-words text-sm leading-tight">{recipe.name}</div>
                        {recipe.category ? <CategoryEmoji category={recipe.category as any} /> : null}
                    </div>
                ) : (
                    <div className="text-sm text-muted-foreground/60">Ingen valgt</div>
                )}
            </div>
        </MagicCard>
    );
}
