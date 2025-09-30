"use client";
import { MagicCard } from "@repo/ui";
import type { DayName } from "../types";

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
    index: _index,
    dayName,
    recipe,
    isDraggingTarget,
    onDrop,
    onDragStart,
    onDragOver,
    onDragLeave,
}: Props) {
    // Høstnyanser per ukedag – HSL-tripletter for MagicCard sin inner-fill via CSS-variabel
    const dayHsl: Record<DayName, string> = {
        Mandag: "40 90% 92%",   // lys gul
        Tirsdag: "36 85% 90%",  // kremgul
        Onsdag: "30 80% 88%",   // lys oransje
        Torsdag: "24 75% 86%",  // aprikos
        Fredag: "20 70% 85%",   // fersken
        Lørdag: "16 65% 84%",   // terracotta lys
        Søndag: "8 65% 84%",    // lys rødlig
    };

    // Kraftigere hover-gradienter per dag (inkluderer brun, grønn og tydelig rød)
    const dayGradients: Record<DayName, { from: string; to: string; color: string }> = {
        Mandag: { from: "#F59E0B", to: "#84CC16", color: "#F59E0B" },  // amber -> lime, varm start
        Tirsdag: { from: "#F97316", to: "#16A34A", color: "#F97316" }, // orange -> green
        Onsdag: { from: "#16A34A", to: "#92400E", color: "#16A34A" },  // green -> brown
        Torsdag: { from: "#92400E", to: "#DC2626", color: "#DC2626" }, // brown -> red
        Fredag: { from: "#DC2626", to: "#7C2D12", color: "#DC2626" },  // red -> deep brown
        Lørdag: { from: "#92400E", to: "#16A34A", color: "#92400E" },  // brown -> green (jordlig)
        Søndag: { from: "#B91C1C", to: "#F59E0B", color: "#B91C1C" },  // deep red -> amber
    };

    return (
        <MagicCard
            className={`rounded-lg flex h-full w-full max-w-sm xl:max-w-full items-center justify-center text-center`}
            style={{ ["--magic-card-bg" as any]: dayHsl[dayName] }}
            gradientFrom={dayGradients[dayName].from}
            gradientTo={dayGradients[dayName].to}
            gradientColor={dayGradients[dayName].color}
            gradientOpacity={isDraggingTarget ? 0.7 : 0.5}
            gradientSize={320}
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