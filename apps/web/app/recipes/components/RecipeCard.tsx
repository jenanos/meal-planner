"use client";
import { MagicCard } from "@repo/ui";
import { suggestionPalettes } from "../../planner/palette";

export type RecipeCardProps = {
    recipe: {
        id: string;
        name: string;
        category?: string | null;
    };
    index: number;
    onClick?: () => void;
};

// A simple non-draggable card matching the planner's SuggestionCard visual style
export function RecipeCard({ recipe, index, onClick }: RecipeCardProps) {
    const palette = suggestionPalettes.search;
    const baseHsl = palette[index % palette.length];

    return (
        <MagicCard
            className="relative rounded-lg flex h-full w-full max-w-sm xl:max-w-full items-center justify-center text-center cursor-pointer"
            style={{ ["--magic-card-bg" as any]: baseHsl }}
            gradientFrom="#F59E0B"
            gradientTo="#84CC16"
            gradientColor="#84CC16"
            gradientOpacity={0.5}
            gradientSize={280}
            onClick={onClick}
        >
            <div className="flex h-full min-h-[132px] flex-col items-center justify-center gap-2 p-4 text-center">
                <div className="font-medium line-clamp-2 break-words">{recipe.name}</div>
                {recipe.category ? (
                    <div className="text-xs text-muted-foreground">{recipe.category}</div>
                ) : null}
            </div>
        </MagicCard>
    );
}
