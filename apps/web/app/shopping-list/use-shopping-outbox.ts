"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  extraOverlay,
  isRetryableError,
  itemOverlay,
  readStoredOps,
  writeStoredOps,
  type QueuedShoppingOp,
  type ShoppingOp,
} from "../../lib/shopping-outbox";

const RETRY_DELAY_MS = 5_000;
const RELOAD_DELAY_MS = 800;

type Options = {
  /**
   * The signed-in user, whose unsent changes are kept across visits. Nothing
   * is stored or restored while this is null.
   */
  userId: string | null;
  /** Sends one change to the server; rejects if it did not get through. */
  send: (_op: ShoppingOp) => Promise<unknown>;
  /** Drops any list request in flight, whose answer would predate a change. */
  cancelReload: () => void;
  /** Reloads the list; resolves once fresh data is in. */
  reload: () => Promise<unknown>;
};

let nextOpId = 0;

/**
 * Queues check marks, shows them immediately and sends them in order,
 * retrying while the connection is down.
 */
export function useShoppingOutbox({
  userId,
  send,
  cancelReload,
  reload,
}: Options) {
  const [ops, setOpsState] = useState<QueuedShoppingOp[]>([]);
  const [waitingForNetwork, setWaitingForNetwork] = useState(false);
  const [rejectedCount, setRejectedCount] = useState(0);

  const opsRef = useRef<QueuedShoppingOp[]>([]);
  const flushingRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacksRef = useRef({ send, cancelReload, reload });
  callbacksRef.current = { send, cancelReload, reload };
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const setOps = useCallback((next: QueuedShoppingOp[]) => {
    opsRef.current = next;
    if (userIdRef.current) writeStoredOps(userIdRef.current, next);
    setOpsState(next);
  }, []);

  // Once everything is sent, reload the list and only then stop showing the
  // acknowledged changes on top of it.
  const scheduleReload = useCallback((delay: number = RELOAD_DELAY_MS) => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(async () => {
      reloadTimerRef.current = null;
      if (opsRef.current.some((op) => !op.acked)) return;
      const covered = new Set(opsRef.current.map((op) => op.id));
      try {
        await callbacksRef.current.reload();
      } catch {
        // Keep trying: until a reload gets through, the acknowledged changes
        // stay on top of the list and would hide what others change.
        scheduleReload(RETRY_DELAY_MS);
        return;
      }
      // A change made while reloading cancelled that request; keep everything
      // until the reload that follows it.
      if (opsRef.current.some((op) => !op.acked)) return;
      setOps(opsRef.current.filter((op) => !covered.has(op.id)));
    }, delay);
  }, [setOps]);

  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    try {
      for (;;) {
        const op = opsRef.current.find((candidate) => !candidate.acked);
        if (!op) break;
        try {
          await callbacksRef.current.send(op);
          setOps(
            opsRef.current.map((candidate) =>
              candidate.id === op.id ? { ...candidate, acked: true } : candidate,
            ),
          );
          setWaitingForNetwork(false);
        } catch (error) {
          if (isRetryableError(error)) {
            setWaitingForNetwork(true);
            retryTimerRef.current = setTimeout(() => {
              retryTimerRef.current = null;
              void flush();
            }, RETRY_DELAY_MS);
            return;
          }
          // The server refused it; drop it so the queue behind it can move.
          setOps(opsRef.current.filter((candidate) => candidate.id !== op.id));
          setRejectedCount((count) => count + 1);
        }
      }
      setWaitingForNetwork(false);
      scheduleReload();
    } finally {
      flushingRef.current = false;
    }
  }, [scheduleReload, setOps]);

  const enqueue = useCallback(
    (op: ShoppingOp) => {
      nextOpId += 1;
      const queued: QueuedShoppingOp = {
        ...op,
        id: `${Date.now().toString(36)}-${nextOpId}`,
      };
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
      callbacksRef.current.cancelReload();
      setOps([...opsRef.current, queued]);
      void flush();
    },
    [flush, setOps],
  );

  // Pick up changes that never got through on an earlier visit, and retry as
  // soon as the connection is back.
  useEffect(() => {
    if (userId) {
      const stored = readStoredOps(userId);
      if (stored.length > 0) {
        setOps([...stored, ...opsRef.current]);
        void flush();
      } else if (opsRef.current.length > 0) {
        // Changes made before the user was known get stored now.
        writeStoredOps(userId, opsRef.current);
      }
    }
    const retry = () => void flush();
    window.addEventListener("online", retry);
    return () => {
      window.removeEventListener("online", retry);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    };
  }, [flush, setOps, userId]);

  const itemChecked = useMemo(() => itemOverlay(ops), [ops]);
  const extraChecked = useMemo(() => extraOverlay(ops), [ops]);
  const pendingCount = useMemo(
    () => ops.filter((op) => !op.acked).length,
    [ops],
  );

  return {
    enqueue,
    /** Checked state per occurrence key for changes not yet in the loaded list. */
    itemChecked,
    /** Checked state per own item name for changes not yet in the loaded list. */
    extraChecked,
    /** Changes the server does not have yet. */
    pendingCount,
    /** True while sending keeps failing for lack of a connection. */
    waitingForNetwork,
    /** Changes the server refused and that were dropped. */
    rejectedCount,
  };
}
