"use client";
/* eslint-env browser */

import Link from "next/link";
import { useEffect, useMemo, useState, type ComponentType, type SVGProps } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Luckiest_Guy } from "next/font/google";
import { MoreHorizontal } from "lucide-react";

export type NavIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;

export type NavItem = {
    href: string;
    label: string;
    icon?: NavIcon;
    primary?: boolean;
};

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

    // Prevent body scroll when menu is open, restoring the previous value
    // so we don't clobber scroll locks set by other overlays (e.g. Radix Dialog).
    useEffect(() => {
        if (!open) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previous;
        };
    }, [open]);

    const primaryItems = useMemo(
        () => items.filter((item) => item.primary),
        [items]
    );
    const overflowItems = useMemo(
        () => items.filter((item) => !item.primary),
        [items]
    );

    const desktopLinks = useMemo(
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
                <div className="flex items-center gap-3">{desktopLinks}</div>
            </div>

            {/* Mobile header (no burger — navigation lives in the bottom bar) */}
            <div className="relative flex items-center py-1 md:hidden">
                {renderBrand("flex-shrink-0 leading-none")}
                <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-sm font-semibold leading-none text-foreground/85">
                    {activeLabel}
                </span>
            </div>

            {/* Mobile bottom navbar */}
            <nav
                className="app-bottom-nav md:hidden"
                aria-label="Hovednavigasjon"
            >
                <ul className="flex items-stretch justify-around gap-1 px-2 pt-1">
                    {primaryItems.map(({ href, label, icon: Icon }) => {
                        const isActive = pathname === href;
                        return (
                            <li key={href} className="flex-1">
                                <Link
                                    href={href}
                                    aria-current={isActive ? "page" : undefined}
                                    className="app-bottom-nav-item"
                                >
                                    {Icon ? <Icon className="h-6 w-6" aria-hidden="true" /> : null}
                                    <span className="text-[11px] leading-tight">{label}</span>
                                </Link>
                            </li>
                        );
                    })}
                    {overflowItems.length > 0 && (
                        <li className="flex-1">
                            <button
                                type="button"
                                className="app-bottom-nav-item w-full"
                                aria-label="Mer"
                                aria-expanded={open}
                                aria-controls="mobile-nav"
                                aria-current={
                                    overflowItems.some(({ href }) => href === pathname)
                                        ? "page"
                                        : undefined
                                }
                                onClick={() => setOpen((v) => !v)}
                            >
                                <MoreHorizontal className="h-6 w-6" aria-hidden="true" />
                                <span className="text-[11px] leading-tight">Mer</span>
                            </button>
                        </li>
                    )}
                </ul>
            </nav>

            {/* Mobile "Mer"-panel (portal to body to avoid stacking issues) */}
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
                            className="app-bottom-nav-panel md:hidden"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="mobile-nav-title"
                        >
                            <div className="flex items-center justify-between gap-2 px-1 py-1">
                                <span id="mobile-nav-title" className="text-sm font-semibold text-foreground/70">Mer</span>
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
                                {overflowItems.map(({ href, label, icon: Icon }) => (
                                    <Link
                                        key={`m-${href}`}
                                        href={href}
                                        className="app-nav-link w-full justify-start text-base"
                                        aria-current={pathname === href ? "page" : undefined}
                                    >
                                        {Icon ? <Icon className="h-5 w-5" aria-hidden="true" /> : null}
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
