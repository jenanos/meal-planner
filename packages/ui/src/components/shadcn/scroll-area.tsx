"use client";

import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { cn } from "../../lib/utils";

export interface ScrollAreaProps extends React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> {
    viewportClassName?: string;
}

export const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
    ({ className, viewportClassName, children, ...props }, ref) => (
        <ScrollAreaPrimitive.Root
            className={cn("relative overflow-hidden", className)}
            {...props}
        >
            <ScrollAreaPrimitive.Viewport
                ref={ref}
                className={cn("h-full w-full rounded-[inherit]", viewportClassName)}
            >
                {children}
            </ScrollAreaPrimitive.Viewport>
            <ScrollBar />
            <ScrollBar orientation="horizontal" />
            <ScrollAreaPrimitive.Corner />
        </ScrollAreaPrimitive.Root>
    )
);
ScrollArea.displayName = "ScrollArea";

export const ScrollBar = React.forwardRef<
    HTMLDivElement,
    React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Scrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
    <ScrollAreaPrimitive.Scrollbar
        ref={ref}
        orientation={orientation}
        className={cn(
            "flex touch-none select-none p-0.5 transition-colors",
            "data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2",
            "data-[orientation=horizontal]:h-2 data-[orientation=horizontal]:w-full",
            className
        )}
        {...props}
    >
        <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-foreground/15" />
    </ScrollAreaPrimitive.Scrollbar>
));
ScrollBar.displayName = "ScrollBar";
