"use client";

/* eslint-env browser */

import { useEffect, useState } from "react";

const STORAGE_KEY = "meal-planner-mock-notice-dismissed";

export function MockModeNotice() {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const hasDismissed = window.sessionStorage.getItem(STORAGE_KEY) === "true";
        setOpen(!hasDismissed);
    }, []);

    const handleClose = () => {
        if (typeof window !== "undefined") {
            window.sessionStorage.setItem(STORAGE_KEY, "true");
        }
        setOpen(false);
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
            onClick={handleClose}
        >
            <div
                className="max-w-xl rounded-xl bg-white p-6 text-sm shadow-2xl dark:bg-neutral-900 dark:text-neutral-100"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="mb-3 text-xl font-semibold text-neutral-900 dark:text-white">Mock mode preview</h2>
                <p className="mb-3 leading-relaxed text-neutral-700 dark:text-neutral-200">
                    You&apos;re viewing the front-end of my meal planner in <strong>mock mode</strong> so it can run on Vercel
                    without the private backend. The UI behaves like the real app, but data is served locally just for
                    this preview.
                </p>
                <p className="mb-6 leading-relaxed text-neutral-700 dark:text-neutral-200">
                    The full platform extends beyond this mock with a tRPC API, PostgreSQL, scheduled jobs, and
                    observability tooling powering the real data workflows. I self-host it with containers, secure access
                    through Cloudflare Tunnel, and manage automation via GitHub Actions, Watchtower, Portainer, and
                    pgAdmin. Dive into the full setup on <a href="https://github.com/jenanos/meal-planner" target="_blank" rel="noreferrer" className="font-medium text-primary underline">GitHub</a>.
                </p>
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={handleClose}
                        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                    >
                        Explore the demo
                    </button>
                </div>
            </div>
        </div>
    );
}
