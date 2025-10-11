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
    isInWeek: boolean;
    onPick?: () => void;

    // HTML5 DnD – gjør valgfrie for dnd-kit
    onDragStart?: React.DragEventHandler;
};

export function SuggestionCard({ recipe, source, index, isInWeek, onPick, onDragStart }: Props) {
    const palette = suggestionPalettes[source];
    const baseHsl = isInWeek ? undefined : palette[index % palette.length];

    return (
        <MagicCard
            className={`${isInWeek ? "cursor-not-allowed opacity-90" : "cursor-grab"} relative rounded-lg flex h-full w-full items-center justify-center text-center`}
            style={baseHsl ? ({ ["--magic-card-bg" as any]: baseHsl } as React.CSSProperties) : undefined}
            gradientFrom={source === "frequent" ? "#EA580C" : source === "longGap" ? "#92400E" : "#F59E0B"}
            gradientTo={source === "frequent" ? "#16A34A" : source === "longGap" ? "#DC2626" : "#84CC16"}
            gradientColor={source === "longGap" ? "#B91C1C" : source === "frequent" ? "#EA580C" : "#84CC16"}
            gradientOpacity={0.5}
            gradientSize={280}
            onClick={() => { if (!isInWeek) onPick?.(); }}
            // Avoid native HTML5 DnD when using dnd-kit:
            draggable={false}
            onDragStart={(e) => {
                if (isInWeek) return;
                onDragStart?.(e);
            }}
        >
            <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 p-4 text-center">
                <div className="font-medium break-words text-sm leading-tight">{recipe.name}</div>
                {recipe.category ? <CategoryEmoji category={recipe.category as any} /> : null}
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