"use client";
import React from "react";
import Twemoji from "react-twemoji";

export type Category = "VEGETAR" | "KYLLING" | "STORFE" | "FISK" | "ANNET" | (string & {});

type Props = {
    category?: Category | null;
    className?: string;
    size?: number; // rem-based size via font-size; defaults to 12px
    showSrLabel?: boolean; // include screen-reader label
};

const emojiByCategory: Record<string, string> = {
    VEGETAR: "🌱",
    KYLLING: "🐔",
    STORFE: "🐄",
    FISK: "🐟",
    ANNET: "❓",
};

const srLabelByCategory: Record<string, string> = {
    VEGETAR: "Vegetar",
    KYLLING: "Kylling",
    STORFE: "Storfe",
    FISK: "Fisk",
    ANNET: "Annet",
};

export function CategoryEmoji({ category, className, size = 10, showSrLabel = true }: Props) {
    if (!category) return null;
    const key = (category || "").toUpperCase();
    const emoji = emojiByCategory[key] ?? "❓";
    const label = srLabelByCategory[key] ?? "Annet";

    // Twemoji replaces unicode with consistent SVG/PNG assets
    return (
        <Twemoji
            className={`text-xs text-muted-foreground ${className ?? ""}`.trim()}
            options={{ className: "twemoji", folder: "svg", ext: ".svg" }}
        >
            <span style={{ fontSize: `${size}px`, lineHeight: 1 }} aria-label={showSrLabel ? label : undefined}>
                {emoji}
            </span>
        </Twemoji>
    );
}

export default CategoryEmoji;
