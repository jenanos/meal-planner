import { describe, expect, it } from "vitest";
import { describeDayChange, type DayChange } from "../lib/planner-change";

// Local times, so the test does not depend on the machine's time zone.
const NOW = new Date(2026, 10, 17, 15, 0);
const KARI = { id: "user-kari", name: "Kari Nordmann" };

const change = (overrides: Partial<DayChange>): DayChange => ({
  kind: "ADDED",
  otherDayIndex: null,
  changedAt: new Date(2026, 10, 17, 14, 32).toISOString(),
  changedBy: KARI,
  ...overrides,
});

describe("describeDayChange", () => {
  it("names the kind of change, the person's first name and the time", () => {
    expect(describeDayChange(change({}), { now: NOW })).toBe(
      "Lagt til av Kari · i dag 14:32",
    );
    expect(
      describeDayChange(change({ kind: "MOVED", otherDayIndex: 0 }), {
        now: NOW,
      }),
    ).toBe("Flyttet fra mandag av Kari · i dag 14:32");
    expect(
      describeDayChange(change({ kind: "MOVED_OUT", otherDayIndex: 6 }), {
        now: NOW,
      }),
    ).toBe("Flyttet til søndag av Kari · i dag 14:32");
  });

  it("says 'deg' for the person looking, and copes with a deleted account", () => {
    expect(
      describeDayChange(change({ kind: "REPLACED" }), {
        now: NOW,
        currentUserId: KARI.id,
      }),
    ).toBe("Endret av deg · i dag 14:32");
    expect(
      describeDayChange(change({ kind: "REMOVED", changedBy: null }), {
        now: NOW,
      }),
    ).toBe("Fjernet av en tidligere bruker · i dag 14:32");
  });

  it("gives yesterday, a weekday within the week and a date beyond it", () => {
    const at = (date: Date) =>
      describeDayChange(change({ changedAt: date.toISOString() }), {
        now: NOW,
      });
    expect(at(new Date(2026, 10, 16, 9, 5))).toBe("Lagt til av Kari · i går 09:05");
    // 12 November 2026 is a Thursday.
    expect(at(new Date(2026, 10, 12, 18, 10))).toBe(
      "Lagt til av Kari · torsdag 18:10",
    );
    expect(at(new Date(2026, 10, 3, 18, 10))).toBe(
      "Lagt til av Kari · 03.11. 18:10",
    );
  });
});
