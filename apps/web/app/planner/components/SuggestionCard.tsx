"use client";
import type { DragEvent } from "react";
import { Card, CardContent } from "@repo/ui";
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
    return (
        <Card
            className={`${isInWeek ? "cursor-not-allowed opacity-90" : "cursor-grab"} relative flex h-full w-full max-w-sm xl:max-w-full items-center justify-center text-center`}
            onClick={() => { if (!isInWeek) onPick?.(); }}
            // Avoid native HTML5 DnD when using dnd-kit:
            draggable={false}
            onDragStart={(e) => {
                if (isInWeek) return;
                onDragStart?.(e);
            }}
        >
            <CardContent className="flex h-full min-h-[132px] flex-col items-center justify-center gap-2 p-4 text-center">
                <div className="font-medium line-clamp-2 break-words">{recipe.name}</div>
                {recipe.category ? <div className="text-xs text-muted-foreground">{recipe.category}</div> : null}
            </CardContent>

            {isInWeek && (
                <div className="pointer-events-none absolute inset-0 rounded-lg bg-background/70 backdrop-blur-xs flex items-center justify-center px-3 text-center">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Allerede i ukeplanen
                    </span>
                </div>
            )}
        </Card>
    );
}