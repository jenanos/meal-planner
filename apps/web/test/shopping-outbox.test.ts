import { describe, expect, it } from "vitest";
import {
  extraOverlay,
  isRetryableError,
  itemOverlay,
  occurrenceKey,
  type ShoppingItemOp,
} from "../lib/shopping-outbox";

const WEEK = "2026-11-09T00:00:00.000Z";

function item(dayIndices: number[], checked: boolean): ShoppingItemOp {
  return {
    kind: "item",
    ingredientId: "lok",
    unit: "stk",
    occurrences: dayIndices.map((dayIndex) => ({ weekStart: WEEK, dayIndex })),
    checked,
  };
}

describe("itemOverlay", () => {
  it("covers every occurrence an op names", () => {
    const overlay = itemOverlay([item([0, 2], true)]);
    expect(overlay.get(occurrenceKey("lok", "stk", WEEK, 0))).toBe(true);
    expect(overlay.get(occurrenceKey("lok", "stk", WEEK, 2))).toBe(true);
    expect(overlay.has(occurrenceKey("lok", "stk", WEEK, 1))).toBe(false);
  });

  it("lets a later change win over an earlier one", () => {
    const overlay = itemOverlay([item([0, 2], true), item([2], false)]);
    expect(overlay.get(occurrenceKey("lok", "stk", WEEK, 0))).toBe(true);
    expect(overlay.get(occurrenceKey("lok", "stk", WEEK, 2))).toBe(false);
  });

  it("keeps items with and without a unit apart", () => {
    const overlay = itemOverlay([{ ...item([0], true), unit: null }]);
    expect(overlay.has(occurrenceKey("lok", "stk", WEEK, 0))).toBe(false);
    expect(overlay.get(occurrenceKey("lok", null, WEEK, 0))).toBe(true);
  });

  it("ignores own items", () => {
    expect(
      itemOverlay([{ kind: "extra", name: "Såpe", weekStart: WEEK, checked: true }])
        .size,
    ).toBe(0);
  });
});

describe("extraOverlay", () => {
  it("keeps the last state per name", () => {
    const overlay = extraOverlay([
      { kind: "extra", name: "Såpe", weekStart: WEEK, checked: true },
      { kind: "extra", name: "Folie", weekStart: WEEK, checked: true },
      { kind: "extra", name: "Såpe", weekStart: WEEK, checked: false },
      item([0], true),
    ]);
    expect(Object.fromEntries(overlay)).toEqual({ Såpe: false, Folie: true });
  });
});

describe("isRetryableError", () => {
  it("retries when no response came back", () => {
    expect(isRetryableError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRetryableError({ data: undefined })).toBe(true);
  });

  it("retries on server trouble and throttling", () => {
    expect(isRetryableError({ data: { httpStatus: 503 } })).toBe(true);
    expect(isRetryableError({ data: { httpStatus: 429 } })).toBe(true);
  });

  it("gives up on requests the server refused", () => {
    expect(isRetryableError({ data: { httpStatus: 400 } })).toBe(false);
    expect(isRetryableError({ data: { httpStatus: 401 } })).toBe(false);
  });
});
