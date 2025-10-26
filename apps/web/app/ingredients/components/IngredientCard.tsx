"use client";
import { MagicCard } from "@repo/ui";
import { suggestionPalettes } from "../../planner/palette";

export type IngredientCardProps = {
    ingredient: {
        id: string;
        name: string;
        unit?: string | null;
        usageCount?: number;
        isPantryItem?: boolean;
    };
    index: number;
    selected?: boolean;
    onClick?: () => void;
};

export function IngredientCard({ ingredient, index, selected, onClick }: IngredientCardProps) {
    const palette = suggestionPalettes.search;
    const baseHsl = palette[index % palette.length];

    return (
        <MagicCard
            className={`relative rounded-lg flex h-full w-full max-w-sm xl:max-w-full items-center justify-center text-center cursor-pointer ${selected ? "ring-2 ring-primary" : ""
                }`}
            style={{ ["--magic-card-bg" as any]: baseHsl }}
            gradientFrom="#14B8A6"
            gradientTo="#9333EA"
            gradientColor="#9333EA"
            gradientOpacity={0.5}
            gradientSize={280}
            onClick={onClick}
        >
            <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-1 p-4 text-center">
                <div className="font-medium line-clamp-2 break-words">{ingredient.name}</div>
                {ingredient.isPantryItem ? (
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                        Basisvare
                    </div>
                ) : null}
                {ingredient.unit ? (
                    <div className="text-xs text-muted-foreground">{ingredient.unit}</div>
                ) : null}
                {typeof ingredient.usageCount === "number" ? (
                    <div className="text-[10px] text-muted-foreground">{ingredient.usageCount} oppskrifter</div>
                ) : null}
            </div>
        </MagicCard>
    );
}
