"use client";
import { MagicCard } from "@repo/ui";
import { suggestionPalettes } from "../palette";
import { CategoryEmoji } from "../../components/CategoryEmoji";

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
    onPick?: () => void;

    // HTML5 DnD – gjør valgfrie for dnd-kit
    onDragStart?: React.DragEventHandler;
};

export function SuggestionCard({ recipe, source, index, onPick, onDragStart }: Props) {
    const palette = suggestionPalettes[source];
    const baseHsl = palette[index % palette.length];

    return (
        <MagicCard
            className="relative flex h-full w-full cursor-grab items-center justify-center rounded-lg text-center"
            style={baseHsl ? ({ ["--magic-card-bg" as any]: baseHsl } as React.CSSProperties) : undefined}
            gradientFrom={source === "frequent" ? "#EA580C" : source === "longGap" ? "#92400E" : "#F59E0B"}
            gradientTo={source === "frequent" ? "#16A34A" : source === "longGap" ? "#DC2626" : "#84CC16"}
            gradientColor={source === "longGap" ? "#B91C1C" : source === "frequent" ? "#EA580C" : "#84CC16"}
            gradientOpacity={0.5}
            gradientSize={280}
            onClick={() => { onPick?.(); }}
            // Avoid native HTML5 DnD when using dnd-kit:
            draggable={false}
            onDragStart={(e) => {
                onDragStart?.(e);
            }}
        >
            <div className="flex h-full min-h-[128px] flex-col items-center justify-center gap-1 p-2.5 text-center sm:min-h-[160px] sm:gap-2 sm:p-4">
                <div className="font-medium break-words text-sm leading-tight">{recipe.name}</div>
                {recipe.category ? <CategoryEmoji category={recipe.category as any} /> : null}
            </div>

        </MagicCard>
    );
}
