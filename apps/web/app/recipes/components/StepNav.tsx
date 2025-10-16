"use client";

import * as React from "react";
import { Button, cn } from "@repo/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type StepNavProps = {
    current: number;
    total: number;
    onPrev?: () => void;
    onNext?: () => void;
    onSelect?: (_index: number) => void;
    nextDisabled?: boolean;
    prevDisabled?: boolean;
    className?: string;
    left?: React.ReactNode; // optional left-side actions (e.g., Close)
    right?: React.ReactNode; // optional right-side actions (e.g., Submit / Edit)
    description?: string | null;
    stepLabels?: string[]; // optional labels for steps, shown in active pill
};

export function StepNav({
    current,
    total,
    onPrev,
    onNext,
    onSelect,
    nextDisabled,
    prevDisabled,
    className,
    left,
    right,
    description,
    stepLabels,
}: StepNavProps) {
    const canPrev = !prevDisabled && current > 0;
    const canNext = !nextDisabled && current < total - 1;

    return (
        <div className={cn("space-y-2", className)}>
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                <div className="flex items-center gap-2">{left}</div>
                <div className="flex items-center justify-center gap-2 min-w-[260px]">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={canPrev ? onPrev : undefined}
                        disabled={!canPrev}
                        aria-label="Forrige steg"
                    >
                        <ChevronLeft className="size-4" />
                    </Button>
                    <div className="flex items-center justify-center gap-2" role="tablist" aria-label="Steg">
                        {Array.from({ length: total }).map((_, idx) => {
                            const active = idx === current;
                            const label = stepLabels?.[idx];
                            return (
                                <button
                                    key={idx}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    className={cn(
                                        "rounded-full transition-colors",
                                        active
                                            ? "h-7 px-3 bg-primary/90 text-primary-foreground text-[11px] font-medium"
                                            : "h-1.5 w-7 bg-muted-foreground/30",
                                    )}
                                    onClick={() => onSelect?.(idx)}
                                    aria-label={label ? `Gå til ${label}` : `Gå til steg ${idx + 1}`}
                                >
                                    {active && (label ? <span className="leading-none">{label}</span> : <span className="leading-none">Steg {idx + 1}</span>)}
                                </button>
                            );
                        })}
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={canNext ? onNext : undefined}
                        disabled={!canNext}
                        aria-label="Neste steg"
                    >
                        <ChevronRight className="size-4" />
                    </Button>
                </div>
                <div className="flex items-center gap-2">{right}</div>
            </div>
            {description ? (
                <p className="text-center text-xs text-muted-foreground max-sm:hidden">{description}</p>
            ) : null}
        </div>
    );
}
