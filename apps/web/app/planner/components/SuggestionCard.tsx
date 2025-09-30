"use client";
import { MagicCard } from "@repo/ui";

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
    // Paletter per kilde; vi varierer pr. element (index) innen hver liste
    const frequentPalette = [
        "34 80% 92%", // kremgul
        "30 75% 90%", // dempet oransje
        "26 70% 88%", // varm aprikos
    ];
    const longGapPalette = [
        "16 70% 90%", // lys terracotta
        "12 65% 88%", // dempet rødlig
        "8 60% 86%",  // lys rødlig
    ];
    const searchPalette = [
        "40 30% 94%", // rolig sand
        "38 28% 93%", // svak variasjon
        "36 26% 92%", // svak variasjon
    ];
    const paletteMap: Record<Props["source"], string[]> = {
        frequent: frequentPalette,
        longGap: longGapPalette,
        search: searchPalette,
    };
    const palette = paletteMap[source];
    const baseHsl = isInWeek ? undefined : palette[index % palette.length];

    return (
        <MagicCard
            className={`${isInWeek ? "cursor-not-allowed opacity-90" : "cursor-grab"} relative rounded-lg flex h-full w-full max-w-sm xl:max-w-full items-center justify-center text-center`}
            style={baseHsl ? ({ ["--magic-card-bg" as any]: baseHsl } as React.CSSProperties) : undefined}
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