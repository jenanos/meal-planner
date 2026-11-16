"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, X } from "lucide-react";
import { cn } from "@repo/ui";

import { useCloseOnBack } from "../../lib/use-close-on-back";
import { useVisualViewport } from "../../lib/use-visual-viewport";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  /** Return false to keep the sheet open (e.g. to confirm discarding edits). */
  beforeClose?: () => boolean;
  /**
   * How the sheet presents on a phone. `page` takes over the whole screen and
   * suits reading and longer forms; `bottom` hugs its content at the bottom
   * edge and suits short tasks. Both become a centred dialog on larger screens.
   */
  variant?: "page" | "bottom";
  title: string;
  /** Keep the title for screen readers only, when the body shows its own. */
  hideTitle?: boolean;
  description?: string;
  /** Icon for the dismiss button: `back` reads as "return to the list". */
  dismissIcon?: "close" | "back";
  /** Primary action, pinned top right where the keyboard never covers it. */
  action?: React.ReactNode;
  /** Focus this instead of the first control when the sheet opens. */
  initialFocus?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  /** Rendered above the body but inside the sheet, e.g. a confirm prompt. */
  overlay?: React.ReactNode;
  bodyClassName?: string;
};

/**
 * The app's overlay surface. It is sized to the *visible* viewport, so the
 * on-screen keyboard shrinks it instead of covering it: the header stays put,
 * the body scrolls, and the focused field is kept in view.
 */
export function Sheet({
  open,
  onClose,
  beforeClose,
  variant = "page",
  title,
  hideTitle = false,
  description,
  dismissIcon = "close",
  action,
  initialFocus,
  children,
  overlay,
  bodyClassName,
}: SheetProps) {
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  const requestClose = React.useCallback(() => {
    if (beforeClose && !beforeClose()) return false;
    onClose();
    return true;
  }, [beforeClose, onClose]);

  useVisualViewport(frameRef, open);
  useCloseOnBack(open, requestClose);

  const DismissIcon = dismissIcon === "back" ? ArrowLeft : X;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-[2000] bg-black/50",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        {/* The frame tracks the visible viewport; the panel is laid out in it. */}
        <div
          ref={frameRef}
          className={cn(
            "pointer-events-none fixed inset-x-0 z-[2001] flex justify-center",
            "top-[var(--vv-top,0px)] h-[var(--vv-height,100dvh)]",
            "items-end sm:items-center sm:p-6",
          )}
        >
          <DialogPrimitive.Content
            ref={panelRef}
            {...(description ? {} : { "aria-describedby": undefined })}
            tabIndex={-1}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              (initialFocus?.current ?? panelRef.current)?.focus({
                preventScroll: true,
              });
            }}
            className={cn(
              "pointer-events-auto relative flex w-full min-h-0 flex-col overflow-hidden bg-background text-foreground outline-none",
              "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out",
              "max-sm:data-[state=open]:slide-in-from-bottom-8 max-sm:data-[state=closed]:slide-out-to-bottom-8",
              "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
              "sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95",
              "sm:max-h-full sm:max-w-lg sm:rounded-2xl sm:border sm:border-border/60 sm:shadow-2xl",
              variant === "page"
                ? "h-full sm:h-[min(100%,44rem)]"
                : "max-h-[92%] rounded-t-3xl shadow-[0_-12px_40px_-12px_rgb(0_0_0/0.35)] sm:h-auto",
            )}
          >
            {variant === "bottom" ? (
              <div
                aria-hidden="true"
                className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-foreground/15 sm:hidden"
              />
            ) : null}
            <header
              className={cn(
                "grid shrink-0 grid-cols-[minmax(2.75rem,1fr)_auto_minmax(2.75rem,1fr)] items-center gap-2 px-2 sm:px-3",
                variant === "page"
                  ? "border-b border-border/50 py-2 max-sm:pt-[calc(env(safe-area-inset-top)+0.5rem)]"
                  : "py-1.5 sm:border-b sm:border-border/50 sm:py-2",
              )}
            >
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  aria-label={dismissIcon === "back" ? "Tilbake" : "Lukk"}
                  className="inline-flex size-11 items-center justify-center justify-self-start rounded-full text-foreground/80 outline-none transition-colors hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring/60 active:bg-foreground/10"
                >
                  <DismissIcon className="size-5" aria-hidden="true" />
                </button>
              </DialogPrimitive.Close>
              <DialogPrimitive.Title
                className={cn(
                  "min-w-0 truncate text-center text-base font-semibold",
                  hideTitle && "sr-only",
                )}
              >
                {title}
              </DialogPrimitive.Title>
              {hideTitle ? <span /> : null}
              <div className="flex items-center justify-self-end pr-1">
                {action}
              </div>
            </header>
            {description ? (
              <DialogPrimitive.Description className="sr-only">
                {description}
              </DialogPrimitive.Description>
            ) : null}
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 [-webkit-overflow-scrolling:touch]",
                "pb-[calc(env(safe-area-inset-bottom)+2rem)] sm:px-6 sm:pb-6",
                "[&_input]:scroll-my-6 [&_textarea]:scroll-my-6 [&_[data-scroll-anchor]]:scroll-mt-3",
                bodyClassName,
              )}
            >
              {children}
            </div>
            {overlay}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

type SheetConfirmProps = {
  title: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/** A small in-sheet prompt, for use as a sheet's `overlay`. */
export function SheetConfirm({
  title,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: SheetConfirmProps) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      className="absolute inset-0 z-10 flex items-end justify-center bg-black/40 p-4 animate-in fade-in-0 sm:items-center"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm space-y-4 rounded-2xl bg-background p-5 shadow-2xl animate-in slide-in-from-bottom-4"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-center text-base font-semibold">{title}</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            autoFocus
            className="h-11 rounded-xl border border-border/70 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:bg-foreground/5"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="h-11 rounded-xl bg-destructive text-sm font-medium text-destructive-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:opacity-90"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
