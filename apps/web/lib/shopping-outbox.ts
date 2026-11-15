/**
 * Check marks made on the shopping list are queued here and sent in order, so
 * a tap in a store with poor coverage is never lost: the list shows it at
 * once, and the queue keeps retrying until the server has it.
 */

export type ShoppingItemOp = {
  kind: "item";
  ingredientId: string;
  unit: string | null;
  occurrences: { weekStart: string; dayIndex: number }[];
  checked: boolean;
};

export type ShoppingExtraOp = {
  kind: "extra";
  name: string;
  weekStart: string;
  checked: boolean;
};

export type ShoppingOp = ShoppingItemOp | ShoppingExtraOp;

export type QueuedShoppingOp = ShoppingOp & {
  id: string;
  /**
   * The server has the change, but the list has not been reloaded since, so
   * it still has to be shown on top of the loaded data.
   */
  acked?: boolean;
};

export function occurrenceKey(
  ingredientId: string,
  unit: string | null,
  weekStart: string,
  dayIndex: number,
) {
  return `${weekStart}::${dayIndex}::${ingredientId}::${unit ?? ""}`;
}

/** Checked state per occurrence as the queue leaves it; later changes win. */
export function itemOverlay(ops: readonly ShoppingOp[]) {
  const overlay = new Map<string, boolean>();
  for (const op of ops) {
    if (op.kind !== "item") continue;
    for (const occurrence of op.occurrences) {
      overlay.set(
        occurrenceKey(
          op.ingredientId,
          op.unit,
          occurrence.weekStart,
          occurrence.dayIndex,
        ),
        op.checked,
      );
    }
  }
  return overlay;
}

/** Checked state per own item (by name) as the queue leaves it. */
export function extraOverlay(ops: readonly ShoppingOp[]) {
  const overlay = new Map<string, boolean>();
  for (const op of ops) {
    if (op.kind === "extra") overlay.set(op.name, op.checked);
  }
  return overlay;
}

/**
 * Whether a failed send is worth repeating. No response at all (offline, a
 * dropped connection) and server-side trouble are; a request the server
 * understood and refused will be refused again.
 */
export function isRetryableError(error: unknown) {
  const status = (error as { data?: { httpStatus?: unknown } } | null)?.data
    ?.httpStatus;
  if (typeof status !== "number") return true;
  return status >= 500 || status === 408 || status === 429;
}

const STORAGE_KEY = "meal-planner.shopping-list.outbox";
const MAX_STORED_OPS = 500;

function isStoredOp(value: unknown): value is QueuedShoppingOp {
  if (!value || typeof value !== "object") return false;
  const op = value as Record<string, unknown>;
  if (typeof op.id !== "string" || typeof op.checked !== "boolean") return false;
  if (op.kind === "extra") {
    return typeof op.name === "string" && typeof op.weekStart === "string";
  }
  if (op.kind === "item") {
    return (
      typeof op.ingredientId === "string" &&
      (op.unit === null || typeof op.unit === "string") &&
      Array.isArray(op.occurrences) &&
      op.occurrences.every(
        (occurrence) =>
          occurrence &&
          typeof occurrence.weekStart === "string" &&
          Number.isInteger(occurrence.dayIndex),
      )
    );
  }
  return false;
}

/** Unsent changes left over from an earlier visit. */
export function readStoredOps(): QueuedShoppingOp[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredOp).map((op) => ({ ...op, acked: false }));
  } catch {
    return [];
  }
}

/** Only unsent changes are kept; acknowledged ones are already on the server. */
export function writeStoredOps(ops: readonly QueuedShoppingOp[]) {
  if (typeof window === "undefined") return;
  try {
    const unsent = ops.filter((op) => !op.acked).slice(-MAX_STORED_OPS);
    if (unsent.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(unsent));
    }
  } catch {
    // Ignore quota errors etc.
  }
}
