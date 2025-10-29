"use client";
/* eslint-env browser */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Luckiest_Guy } from "next/font/google";

export type NavItem = { href: string; label: string };

type Props = {
    items: NavItem[];
};

const luckiestGuy = Luckiest_Guy({ subsets: ["latin"], weight: "400", display: "swap" });

export function ResponsiveNav({ items }: Props) {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    // Close on route change
    useEffect(() => {
        setOpen(false);
    }, [pathname]);

    // Close on Esc
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    // Prevent body scroll when menu is open
    useEffect(() => {
        if (open) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
    }, [open]);

    const links = useMemo(
        () =>
            items.map(({ href, label }) => (
                <Link
                    key={href}
                    href={href}
                    className="app-nav-link"
                    aria-current={pathname === href ? "page" : undefined}
                >
                    {label}
                </Link>
            )),
        [items, pathname]
    );
    const activeLabel = useMemo(() => {
        const current = items.find(({ href }) => href === pathname);
        return current?.label ?? "Butta";
    }, [items, pathname]);

    const renderBrand = (extraClassName?: string) => (
        <Link
            href="/"
            aria-label="Butta hjem"
            className={`${extraClassName ?? ""} ${luckiestGuy.className} select-none text-lg leading-none tracking-wide text-transparent transition-transform duration-200 hover:scale-105 md:text-2xl bg-clip-text bg-gradient-to-r from-[#ff8a3d] via-[#ff4f3c] to-[#c81d25]`}
        >
            Butta
        </Link>
    );

    return (
        <div className="mx-auto w-full max-w-6xl px-4 py-1.5 md:py-3">
            {/* Desktop nav */}
            <div className="hidden items-center justify-between gap-6 md:flex">
                {renderBrand()}
                <div className="flex items-center gap-3">{links}</div>
            </div>

            {/* Mobile header */}
            <div className="relative flex items-center gap-2 py-1 md:hidden">
                {renderBrand("flex-shrink-0 leading-none")}
                <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-sm font-semibold leading-none text-foreground/85">
                    {activeLabel}
                </span>
                <button
                    type="button"
                    className={`ml-auto inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-medium text-foreground/80 transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${open ? "invisible pointer-events-none" : ""}`}
                    aria-label="Åpne meny"
                    aria-expanded={open}
                    aria-controls="mobile-nav"
                    onClick={() => setOpen((v) => !v)}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                        <path d="M3.75 6.75h16.5a.75.75 0 000-1.5H3.75a.75.75 0 000 1.5z" />
                        <path d="M3.75 12.75h16.5a.75.75 0 000-1.5H3.75a.75.75 0 000 1.5z" />
                        <path d="M3.75 18.75h16.5a.75.75 0 000-1.5H3.75a.75.75 0 000 1.5z" />
                    </svg>
                </button>
            </div>

            {/* Mobile menu panel (portal to body to avoid stacking issues) */}
            {mounted && open &&
                createPortal(
                    <>
                        {/* Backdrop */}
                        <div
                            className="fixed inset-0 z-[9998] bg-black/20 backdrop-blur-sm md:hidden"
                            onClick={() => setOpen(false)}
                        />
                        <div
                            id="mobile-nav"
                            className="fixed right-3 top-3 z-[9999] w-[min(92vw,360px)] rounded-2xl border bg-[hsl(var(--card)/0.97)] p-3 shadow-xl md:hidden"
                            role="dialog"
                            aria-modal="true"
                        >
                            <div className="flex items-center justify-between gap-2 px-1 py-1">
                                <span className="text-sm font-semibold text-foreground/70">Meny</span>
                                <button
                                    className="inline-flex items-center justify-center rounded-full px-2 py-2 text-foreground/70 hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                                    aria-label="Lukk meny"
                                    onClick={() => setOpen(false)}
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                        className="h-5 w-5"
                                    >
                                        <path
                                            fillRule="evenodd"
                                            d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 11-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z"
                                            clipRule="evenodd"
                                        />
                                    </svg>
                                </button>
                            </div>
                            <div className="mt-1 flex flex-col gap-2 p-1">
                                {items.map(({ href, label }) => (
                                    <Link
                                        key={`m-${href}`}
                                        href={href}
                                        className="app-nav-link w-full justify-start text-base"
                                        aria-current={pathname === href ? "page" : undefined}
                                    >
                                        {label}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </>,
                    document.body
                )}
        </div>
    );
}

export default ResponsiveNav;
