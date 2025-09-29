"use client";
import type { ComponentProps } from "react";
import { Button } from "@repo/ui";
import type { TimelineWeekEntry } from "../types";

type Props = {
    weeks: TimelineWeekEntry[];
    variant: "desktop" | "mobile";
    onPrev: () => void;
    onNext: () => void;
    disablePrev: boolean;
    disableNext: boolean;
    activeWeekStart: string;
    currentWeekStart: string;
    activeWeekIndex: number;
    mobileWindowStart: number;
    mobileMaxStart: number;
    onSelectWeek: (weekStart: string, indexHint?: number | null) => void;
};

export function WeekSelector({
    weeks,
    variant,
    onPrev,
    onNext,
    disablePrev,
    disableNext,
    activeWeekStart,
    currentWeekStart,
    activeWeekIndex,
    mobileWindowStart,
    mobileMaxStart,
    onSelectWeek,
}: Props) {
    if (!weeks.length) return null;

    const baseWidth = variant === "mobile" ? "min-w-[96px]" : "min-w-[120px]";
    const gap = variant === "mobile" ? "gap-2" : "gap-3";
    const paddingX = variant === "mobile" ? "px-12" : "px-16";
    const gradientWidth = variant === "mobile" ? "w-12" : "w-20";

    const activePos = weeks.findIndex((entry) => entry.index === activeWeekIndex);
    const needsLeftPlaceholder = variant === "mobile" && activePos === 0 && mobileWindowStart === 0;
    const needsRightPlaceholder =
        variant === "mobile" && activePos === weeks.length - 1 && mobileWindowStart === mobileMaxStart;

    let visibleWeeks = weeks;
    if (variant === "mobile") {
        if (needsLeftPlaceholder && visibleWeeks.length > 2) {
            visibleWeeks = visibleWeeks.slice(0, visibleWeeks.length - 1);
        }
        if (needsRightPlaceholder && visibleWeeks.length > 2) {
            visibleWeeks = visibleWeeks.slice(1);
        }
    }

    const BtnVariant: ComponentProps<typeof Button>["variant"] = "ghost";

    return (
        <div className="relative flex min-h-[44px] items-center justify-center">
            <div className={`pointer-events-none absolute inset-y-0 left-0 ${gradientWidth} bg-gradient-to-r from-background via-background/80 to-transparent z-10`} />
            <div className={`pointer-events-none absolute inset-y-0 right-0 ${gradientWidth} bg-gradient-to-l from-background via-background/80 to-transparent z-10`} />

            <div className={`relative z-20 flex ${gap} overflow-hidden ${paddingX} py-1`}>
                {needsLeftPlaceholder ? (
                    <span aria-hidden className={`inline-block ${baseWidth} h-9 rounded-md opacity-0 pointer-events-none`} />
                ) : null}

                {visibleWeeks.map((entry, index) => {
                    if (!entry.week) {
                        return (
                            <span
                                key={`placeholder-${variant}-${index}`}
                                className={`inline-block ${baseWidth} h-9 rounded-md opacity-0 pointer-events-none`}
                                aria-hidden
                            />
                        );
                    }

                    const w = entry.week;
                    const isActive = w.weekStart === activeWeekStart;

                    let opacityClass = "opacity-65";
                    if (entry.index !== null && activeWeekIndex !== -1) {
                        const distance = Math.abs(entry.index - activeWeekIndex);
                        if (distance === 0) opacityClass = "opacity-100";
                        else if (distance === 1) opacityClass = "opacity-70";
                        else if (distance >= 2) opacityClass = "opacity-45";
                    } else if (index === 0 || index === weeks.length - 1) {
                        opacityClass = "opacity-45";
                    }

                    return (
                        <Button
                            key={w.weekStart}
                            type="button"
                            variant={BtnVariant}
                            size="sm"
                            className={`${baseWidth} px-3 text-sm transition-opacity whitespace-nowrap ${isActive ? "font-semibold opacity-100 bg-primary/10" : opacityClass
                                }`}
                            onClick={() => onSelectWeek(w.weekStart, entry.index)}
                        >
                            {w.label}
                        </Button>
                    );
                })}

                {needsRightPlaceholder ? (
                    <span aria-hidden className={`inline-block ${baseWidth} h-9 rounded-md opacity-0 pointer-events-none`} />
                ) : null}
            </div>

            <Button type="button" size="icon" className={`absolute left-2 top-1/2 -translate-y-1/2 shadow-sm z-10 ${variant === "mobile" ? "size-8" : "size-9"}`} aria-label="Forrige uke" onClick={onPrev} disabled={disablePrev}>
                ←
            </Button>
            <Button type="button" size="icon" className={`absolute right-2 top-1/2 -translate-y-1/2 shadow-sm z-10 ${variant === "mobile" ? "size-8" : "size-9"}`} aria-label="Neste uke" onClick={onNext} disabled={disableNext}>
                →
            </Button>
        </div>
    );
}