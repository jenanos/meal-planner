"use client";
import { useCallback, useEffect, useRef } from "react";
import { Button, ScrollArea } from "@repo/ui";
import type { TimelineWeekEntry } from "../types";

type Props = {
    weeks: TimelineWeekEntry[];
    activeWeekStart: string;
    activeWeekIndex: number;
    onSelectWeek: (weekStart: string, indexHint?: number | null) => void;
};

export function WeekSelector({ weeks, activeWeekStart, activeWeekIndex, onSelectWeek }: Props) {
    if (!weeks.length) return null;

    // Ref points to the actual ScrollArea viewport (forwarded by UI component)
    const viewportRef = useRef<HTMLDivElement | null>(null);

    const scrollByStep = useCallback((dir: -1 | 1) => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const step = Math.max(240, Math.floor(viewport.clientWidth * 0.6));
        viewport.scrollBy({ left: dir * step, behavior: "smooth" });
    }, []);

    // Center the active week in view on mount and when active changes
    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const activeEl = viewport.querySelector<HTMLElement>(`[data-week='${activeWeekStart}']`);
        if (!activeEl) return;
        const offset = activeEl.offsetLeft + activeEl.offsetWidth / 2 - viewport.clientWidth / 2;
        const max = viewport.scrollWidth - viewport.clientWidth;
        const next = Math.max(0, Math.min(offset, max));
        viewport.scrollTo({ left: next, behavior: "smooth" });
    }, [activeWeekStart, weeks.length]);

    return (
        <div className="relative flex items-center">
            {/* Desktop scroll buttons */}
            <div className="pointer-events-none absolute inset-y-0 left-10 sm:left-14 w-8 bg-gradient-to-r from-background to-transparent hidden sm:block z-10" />
            <div className="pointer-events-none absolute inset-y-0 right-10 sm:right-14 w-8 bg-gradient-to-l from-background to-transparent hidden sm:block z-10" />
            <Button
                type="button"
                size="icon"
                variant="ghost"
                className="hidden sm:flex absolute left-1 top-1/2 -translate-y-1/2 z-20"
                aria-label="Scroll venstre"
                onClick={() => scrollByStep(-1)}
            >
                ←
            </Button>
            <Button
                type="button"
                size="icon"
                variant="ghost"
                className="hidden sm:flex absolute right-1 top-1/2 -translate-y-1/2 z-20"
                aria-label="Scroll høyre"
                onClick={() => scrollByStep(1)}
            >
                →
            </Button>

            <ScrollArea ref={viewportRef} className="w-full mx-10 sm:mx-14" viewportClassName="overflow-x-auto overflow-y-hidden">
                <div className="flex items-center gap-3 px-4 py-1 min-h-[44px]">
                    {weeks.map((entry) => {
                        if (!entry.week) return null;
                        const w = entry.week;
                        const isActive = w.weekStart === activeWeekStart;
                        const distance = entry.index !== null && activeWeekIndex !== -1 ? Math.abs(entry.index - activeWeekIndex) : null;
                        let opacityClass = "opacity-65";
                        if (distance === 0) opacityClass = "opacity-100";
                        else if (distance === 1) opacityClass = "opacity-70";
                        else if (distance !== null && distance >= 2) opacityClass = "opacity-45";

                        return (
                            <Button
                                key={w.weekStart}
                                data-week={w.weekStart}
                                type="button"
                                variant="ghost"
                                size="sm"
                                className={`min-w-[120px] px-3 text-sm transition-opacity whitespace-nowrap ${isActive ? "font-semibold opacity-100 bg-primary/10" : opacityClass}`}
                                onClick={() => {
                                    if (isActive) return;
                                    onSelectWeek(w.weekStart, entry.index);
                                }}
                            >
                                {w.label}
                            </Button>
                        );
                    })}
                </div>
            </ScrollArea>
        </div>
    );
}