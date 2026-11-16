"use client";

import { useEffect, type RefObject } from "react";

/**
 * Keep an element sized to the part of the screen that is actually visible.
 *
 * The on-screen keyboard shrinks the *visual* viewport, but on most phones not
 * the layout viewport, so `100dvh` and `position: fixed` still reach in under
 * the keyboard. While `active`, this writes the visual viewport's offset and
 * height to `--vv-top` and `--vv-height` on the element, and keeps whatever
 * field has focus on screen as the keyboard slides in.
 *
 * A focused element (or an ancestor) may carry `data-scroll-anchor="start"` to
 * be scrolled to the top of its scroller instead of just into view – for
 * fields that reveal content below themselves, such as search suggestions.
 */
export function useVisualViewport(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return;
    const viewport = window.visualViewport;
    let frame = 0;

    const revealFocus = () => {
      const element = ref.current;
      const focused = document.activeElement;
      if (!element || !(focused instanceof HTMLElement)) return;
      if (!element.contains(focused) || !isTextField(focused)) return;
      const anchor = focused.closest<HTMLElement>("[data-scroll-anchor]");
      if (anchor?.dataset.scrollAnchor === "start") {
        anchor.scrollIntoView({ block: "start", behavior: "smooth" });
      } else {
        focused.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    };

    const apply = () => {
      const element = ref.current;
      if (!element) return;
      const height = viewport?.height ?? window.innerHeight;
      const top = viewport?.offsetTop ?? 0;
      element.style.setProperty("--vv-height", `${height}px`);
      element.style.setProperty("--vv-top", `${top}px`);
    };

    const onResize = () => {
      apply();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(revealFocus);
    };

    // The element may mount a tick after `active` flips (portals, presence).
    apply();
    frame = requestAnimationFrame(apply);

    const onFocusIn = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(revealFocus);
    };

    viewport?.addEventListener("resize", onResize);
    viewport?.addEventListener("scroll", apply);
    window.addEventListener("resize", onResize);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", onResize);
      viewport?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [active, ref]);
}

function isTextField(element: HTMLElement) {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element.isContentEditable
  );
}
