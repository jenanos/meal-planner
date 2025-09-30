"use client";
import type { DragEvent } from "react";
import { MagicCard } from "@repo/ui";
import type { WeekRecipe, DayName } from "../types";

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
    index,
    dayName,
    recipe,
    isDraggingTarget,
    onDrop,
    onDragStart,
    onDragOver,
    onDragLeave,
}: Props) {
    // Høstnyanser per ukedag (lys base, blir varmere mot helgen)
    const dayBgClass: Record<DayName, string> = {
        Mandag: "bg-[hsl(40_90%_92%)]",   // lys gul
        Tirsdag: "bg-[hsl(36_85%_90%)]",  // kremgul
        Onsdag: "bg-[hsl(30_80%_88%)]",   // lys oransje
        Torsdag: "bg-[hsl(24_75%_86%)]",  // aprikos
        Fredag: "bg-[hsl(20_70%_85%)]",   // fersken
        Lørdag: "bg-[hsl(16_65%_84%)]",   // terracotta lys
        Søndag: "bg-[hsl(8_65%_84%)]",    // lys rødlig
    };

    return (
        <MagicCard
            className={`rounded-lg flex h-full w-full max-w-sm xl:max-w-full items-center justify-center text-center ${dayBgClass[dayName]} [--magic-card-bg:theme(colors.card)]`}
            gradientFrom="#F59E0B" /* amber-500 */
            gradientTo="#DC2626"   /* red-600 */
            gradientColor="#F59E0B" /* warm glow instead of dark */
            gradientOpacity={isDraggingTarget ? 0.6 : 0.28}
            gradientSize={240}
            draggable={!!onDragStart}
            onDragStart={(e) => { onDragStart?.(e); }}
            onDragOver={(e) => { e.preventDefault(); onDragOver?.(e); }}
            onDragLeave={(e) => { onDragLeave?.(e); }}
            onDrop={(e) => { e.preventDefault(); onDrop?.(e); }}
        >
            <div className="flex h-full min-h-[132px] flex-col items-center justify-center gap-2 p-4 text-center">
                <div className="text-xs text-muted-foreground">{dayName}</div>
                {recipe ? (
                    <div className="space-y-1">
                        <div className="font-medium line-clamp-2 break-words">{recipe.name}</div>
                        {recipe.category ? <div className="text-xs text-muted-foreground">{recipe.category}</div> : null}
                    </div>
                ) : (
                    <div className="text-sm text-muted-foreground/60">Ingen valgt</div>
                )}
            </div>
        </MagicCard>
    );
}