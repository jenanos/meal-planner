import { describe, expect, it } from "vitest";
import { localTodayMs, resolveShoppingWindow } from "../lib/shopping-window";

const DAY = 86_400_000;
const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`).getTime();

describe("localTodayMs", () => {
  it("is UTC midnight of the local calendar date", () => {
    const lateEvening = new Date(2026, 10, 14, 23, 30);
    expect(localTodayMs(lateEvening)).toBe(utc("2026-11-14"));
  });
});

describe("resolveShoppingWindow", () => {
  // 2026-11-14 is a Saturday; its week starts Monday 2026-11-09.
  const saturday = utc("2026-11-14");

  it("finds the Monday of the current week", () => {
    const window = resolveShoppingWindow(saturday, "today");
    expect(window.weekStartISO).toBe("2026-11-09T00:00:00.000Z");
    expect(window.weekStartMs).toBe(utc("2026-11-09"));
  });

  it("covers only today for the shortest horizon", () => {
    const window = resolveShoppingWindow(saturday, "today");
    expect(window.endMs).toBe(saturday);
    expect(window.lookaheadWeeks).toBe(0);
  });

  it("stops on Sunday for rest-of-week", () => {
    expect(resolveShoppingWindow(saturday, "rest-of-week").endMs).toBe(
      utc("2026-11-15"),
    );
    const monday = utc("2026-11-09");
    expect(resolveShoppingWindow(monday, "rest-of-week").endMs).toBe(
      utc("2026-11-15"),
    );
    expect(resolveShoppingWindow(monday, "rest-of-week").lookaheadWeeks).toBe(0);
  });

  it("crosses into next week when the days run out", () => {
    const three = resolveShoppingWindow(saturday, "three-days");
    expect(three.endMs).toBe(saturday + 2 * DAY);
    expect(three.lookaheadWeeks).toBe(1);

    const seven = resolveShoppingWindow(saturday, "seven-days");
    expect(seven.endMs).toBe(utc("2026-11-20"));
    expect(seven.lookaheadWeeks).toBe(1);
  });

  it("stays within the week when seven days start on a Monday", () => {
    const window = resolveShoppingWindow(utc("2026-11-09"), "seven-days");
    expect(window.endMs).toBe(utc("2026-11-15"));
    expect(window.lookaheadWeeks).toBe(0);
  });

  it("reaches two weeks ahead for fourteen days from mid-week", () => {
    const window = resolveShoppingWindow(saturday, "fourteen-days");
    expect(window.endMs).toBe(utc("2026-11-27"));
    expect(window.lookaheadWeeks).toBe(2);
  });
});
