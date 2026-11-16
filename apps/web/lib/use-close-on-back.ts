"use client";

import { useEffect, useRef } from "react";

const MARKER = "__sheet";

/**
 * A `history.back()` owed by a sheet that just closed. Held for a tick so a
 * sheet opening in the same breath (view → edit) can take over the history
 * entry instead of racing the back navigation.
 */
let pendingBack: ReturnType<typeof setTimeout> | null = null;

/**
 * Let the system back button / back gesture close an overlay, the way it does
 * in a native app, rather than leaving the page underneath it.
 *
 * While `open`, an extra history entry is on the stack. Going back pops it and
 * calls `requestClose`; when that returns false (the close was vetoed, e.g.
 * unsaved changes) the entry is put back. Closing any other way removes the
 * entry again.
 */
export function useCloseOnBack(open: boolean, requestClose: () => boolean) {
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  useEffect(() => {
    if (!open) return;

    const push = () =>
      window.history.pushState({ ...window.history.state, [MARKER]: true }, "");

    if (pendingBack !== null) {
      clearTimeout(pendingBack);
      pendingBack = null;
    } else {
      push();
    }

    let popped = false;
    const onPopState = () => {
      if (requestCloseRef.current()) {
        popped = true;
      } else {
        push();
      }
    };
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
      if (popped) return;
      pendingBack = setTimeout(() => {
        pendingBack = null;
        // Only undo our own entry: after a navigation it is no longer on top.
        if (window.history.state?.[MARKER]) window.history.back();
      }, 0);
    };
  }, [open]);
}
