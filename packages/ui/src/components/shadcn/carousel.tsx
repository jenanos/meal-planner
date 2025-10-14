"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "../../lib/utils";
import { Button } from "./button";

export type CarouselEvent = "select";

export type CarouselApi = {
    scrollTo: (index: number) => void;
    scrollNext: () => void;
    scrollPrev: () => void;
    selectedScrollSnap: () => number;
    scrollSnapList: () => number[];
    canScrollNext: () => boolean;
    canScrollPrev: () => boolean;
    on: (event: CarouselEvent, callback: () => void) => () => void;
    off: (event: CarouselEvent, callback: () => void) => void;
};

export type CarouselOptions = {
    loop?: boolean;
};

export type CarouselPlugin = unknown;

type CarouselContextValue = {
    api: CarouselApi;
    selectedIndex: number;
    itemCount: number;
    setItemCount: (count: number) => void;
    options: CarouselOptions | undefined;
};

const CarouselContext = React.createContext<CarouselContextValue | null>(null);

const useCarousel = () => {
    const context = React.useContext(CarouselContext);
    if (!context) {
        throw new Error("useCarousel must be used inside <Carousel />");
    }
    return context;
};

const Carousel = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & {
        opts?: CarouselOptions;
        plugins?: CarouselPlugin[];
        setApi?: (api: CarouselApi) => void;
    }
>(({ className, children, opts, setApi, ...props }, ref) => {
    const [selectedIndex, setSelectedIndex] = React.useState(0);
    const [itemCount, setItemCount] = React.useState(0);

    const listenersRef = React.useRef(new Map<CarouselEvent, Set<() => void>>());
    const selectedIndexRef = React.useRef(selectedIndex);
    const itemCountRef = React.useRef(itemCount);

    selectedIndexRef.current = selectedIndex;
    itemCountRef.current = itemCount;

    const emit = React.useCallback((event: CarouselEvent) => {
        const listeners = listenersRef.current.get(event);
        if (!listeners) return;
        listeners.forEach((listener) => listener());
    }, []);

    const clampIndex = React.useCallback(
        (index: number) => {
            const count = itemCountRef.current;
            if (count <= 0) return 0;
            if (opts?.loop) {
                const mod = index % count;
                return mod < 0 ? mod + count : mod;
            }
            return Math.min(Math.max(index, 0), count - 1);
        },
        [opts?.loop]
    );

    const apiRef = React.useRef<CarouselApi>();
    if (!apiRef.current) {
        apiRef.current = {
            scrollTo: (index: number) => {
                setSelectedIndex((prev) => {
                    const next = clampIndex(index);
                    return prev === next ? prev : next;
                });
            },
            scrollNext: () => {
                setSelectedIndex((prev) => clampIndex(prev + 1));
            },
            scrollPrev: () => {
                setSelectedIndex((prev) => clampIndex(prev - 1));
            },
            selectedScrollSnap: () => selectedIndexRef.current,
            scrollSnapList: () => Array.from({ length: itemCountRef.current }, (_, i) => i),
            canScrollNext: () => {
                if (opts?.loop) return itemCountRef.current > 0;
                return selectedIndexRef.current < Math.max(itemCountRef.current - 1, 0);
            },
            canScrollPrev: () => {
                if (opts?.loop) return itemCountRef.current > 0;
                return selectedIndexRef.current > 0;
            },
            on: (event: CarouselEvent, callback: () => void) => {
                const listeners = listenersRef.current.get(event) ?? new Set();
                listeners.add(callback);
                listenersRef.current.set(event, listeners);
                return () => {
                    listeners.delete(callback);
                };
            },
            off: (event: CarouselEvent, callback: () => void) => {
                const listeners = listenersRef.current.get(event);
                if (!listeners) return;
                listeners.delete(callback);
            },
        } satisfies CarouselApi;
    }

    React.useEffect(() => {
        if (!opts?.loop && itemCount > 0) {
            setSelectedIndex((prev) => Math.min(prev, itemCount - 1));
        } else if (itemCount === 0) {
            setSelectedIndex(0);
        }
    }, [itemCount, opts?.loop]);

    React.useEffect(() => {
        emit("select");
    }, [selectedIndex, emit]);

    React.useEffect(() => {
        if (setApi) {
            setApi(apiRef.current!);
        }
    }, [setApi]);

    const contextValue = React.useMemo<CarouselContextValue>(() => ({
        api: apiRef.current!,
        selectedIndex,
        itemCount,
        setItemCount,
        options: opts,
    }), [selectedIndex, itemCount, opts]);

    return (
        <CarouselContext.Provider value={contextValue}>
            <div ref={ref} className={cn("relative", className)} {...props}>
                {children}
            </div>
        </CarouselContext.Provider>
    );
});
Carousel.displayName = "Carousel";

const CarouselContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, children, ...props }, ref) => {
        const { selectedIndex, setItemCount } = useCarousel();
        const childArray = React.useMemo(() => React.Children.toArray(children) as React.ReactElement[], [children]);

        React.useEffect(() => {
            setItemCount(childArray.length);
        }, [childArray.length, setItemCount]);

        return (
            <div ref={ref} className={cn("relative w-full", className)} {...props}>
                {childArray.map((child, index) => {
                    if (!React.isValidElement(child)) return child;
                    const isActive = index === selectedIndex;
                    return React.cloneElement(child, {
                        key: child.key ?? index,
                        className: cn(child.props.className, isActive ? "block" : "hidden"),
                        "aria-hidden": isActive ? undefined : true,
                        "data-state": isActive ? "active" : "inactive",
                    });
                })}
            </div>
        );
    }
);
CarouselContent.displayName = "CarouselContent";

const CarouselItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div ref={ref} className={cn("w-full", className)} {...props} />
    )
);
CarouselItem.displayName = "CarouselItem";

const CarouselPrevious = React.forwardRef<
    HTMLButtonElement,
    React.ComponentPropsWithoutRef<typeof Button>
>(({ className, children, onClick, ...props }, ref) => {
    const { api } = useCarousel();

    return (
        <Button
            ref={ref}
            variant="outline"
            size="icon"
            className={cn("h-8 w-8", className)}
            onClick={(event) => {
                onClick?.(event);
                event.preventDefault();
                api.scrollPrev();
            }}
            disabled={!api.canScrollPrev()}
            {...props}
        >
            {children ?? (
                <>
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">Forrige</span>
                </>
            )}
        </Button>
    );
});
CarouselPrevious.displayName = "CarouselPrevious";

const CarouselNext = React.forwardRef<
    HTMLButtonElement,
    React.ComponentPropsWithoutRef<typeof Button>
>(({ className, children, onClick, ...props }, ref) => {
    const { api } = useCarousel();

    return (
        <Button
            ref={ref}
            variant="outline"
            size="icon"
            className={cn("h-8 w-8", className)}
            onClick={(event) => {
                onClick?.(event);
                event.preventDefault();
                api.scrollNext();
            }}
            disabled={!api.canScrollNext()}
            {...props}
        >
            {children ?? (
                <>
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">Neste</span>
                </>
            )}
        </Button>
    );
});
CarouselNext.displayName = "CarouselNext";

export { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, useCarousel };
