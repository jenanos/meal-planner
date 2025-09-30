"use client";
import type { DragEvent } from "react";
import { MagicCard } from "@repo/ui";
import type { DragSource, RecipeDTO } from "../types";

export type Props = {
    recipe: {
        id: string;
        name: string;
        category: string;
        everydayScore: number;
        healthScore: number;
        ingredients: any[];
        lastUsed: string | null;
        usageCount: number;
    };
    source: "search" | "longGap" | "frequent";
    index: number;
    isInWeek: boolean;
    onPick?: () => void;

    // HTML5 DnD – gjør valgfrie for dnd-kit
    onDragStart?: React.DragEventHandler;
};

export function SuggestionCard({ recipe, source, index, isInWeek, onPick, onDragStart }: Props) {
    // Ulike bakgrunnsnyanser etter kilde for bedre visuell gruppering
    const bgBySource: Record<Props["source"], string> = {
        frequent: "bg-[hsl(34_80%_92%)]", // varm gul-krem
        longGap: "bg-[hsl(16_70%_90%)]",  // lys terracotta
        search: "bg-[hsl(40_30%_94%)]",   // nøytral sand (bevisst rolig for søk)
    };
    const baseBgClass = isInWeek ? "bg-card" : bgBySource[source];

    return (
        <MagicCard
            className={`${isInWeek ? "cursor-not-allowed opacity-90" : "cursor-grab"} relative rounded-lg flex h-full w-full max-w-sm xl:max-w-full items-center justify-center text-center ${baseBgClass} [--magic-card-bg:theme(colors.card)]`}
            gradientFrom="#F97316" /* orange-500 */
            gradientTo="#A16207"   /* amber-700 */
            gradientColor="#F97316"
            gradientOpacity={0.24}
            gradientSize={220}
            onClick={() => { if (!isInWeek) onPick?.(); }}
            // Avoid native HTML5 DnD when using dnd-kit:
            draggable={false}
            onDragStart={(e) => {
                if (isInWeek) return;
                onDragStart?.(e);
            }}
        >
            <div className="flex h-full min-h-[132px] flex-col items-center justify-center gap-2 p-4 text-center">
                <div className="font-medium line-clamp-2 break-words">{recipe.name}</div>
                {recipe.category ? <div className="text-xs text-muted-foreground">{recipe.category}</div> : null}
            </div>

            {isInWeek && (
                <div className="pointer-events-none absolute inset-0 rounded-lg bg-background/70 backdrop-blur-xs flex items-center justify-center px-3 text-center">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Allerede i ukeplanen
                    </span>
                </div>
            )}
        </MagicCard>
    );
}