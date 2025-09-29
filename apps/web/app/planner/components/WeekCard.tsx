"use client";
import type { DragEvent } from "react";
import { Card, CardContent } from "@repo/ui";
import type { WeekRecipe } from "../types";

type Props = {
    index: number;
    dayName: string;
    recipe: WeekRecipe;
    isDraggingTarget: boolean;
    onDrop: (e: DragEvent<HTMLDivElement>) => void;
    onDragStart: (e: DragEvent) => void;
    onDragOver: (e: DragEvent<HTMLDivElement>) => void;
    onDragLeave: () => void;
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
    return (
        <Card
            className={`${isDraggingTarget ? "ring-2 ring-ring " : ""}flex h-full w-full max-w-sm xl:max-w-full items-center justify-center text-center`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            draggable={Boolean(recipe)}
            onDragStart={(e) => {
                if (!recipe) return;
                onDragStart(e);
            }}
        >
            <CardContent className="flex h-full min-h-[132px] flex-col items-center justify-center gap-2 p-4 text-center">
                <div className="text-xs text-muted-foreground">{dayName}</div>
                {recipe ? (
                    <div className="space-y-1">
                        <div className="font-medium line-clamp-2 break-words">{recipe.name}</div>
                        {recipe.category ? <div className="text-xs text-muted-foreground">{recipe.category}</div> : null}
                    </div>
                ) : (
                    <div className="text-sm text-muted-foreground/60">Ingen valgt</div>
                )}
            </CardContent>
        </Card>
    );
}