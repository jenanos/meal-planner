import { describe, expect, it } from "vitest";
import { daysToKeep, type PlannedDayKind } from "../lib/planner-generate";

const WEEK: PlannedDayKind[] = [
  "RECIPE",
  "EMPTY",
  "TAKEAWAY",
  "RECIPE",
  "FREEZER",
  "EMPTY",
  "RECIPE",
];

describe("daysToKeep", () => {
  it("keeps every planned day when filling", () => {
    expect(daysToKeep("fill", WEEK, 0)).toEqual([0, 2, 3, 4, 6]);
  });

  it("keeps only takeaway, freezer and locked days when refreshing", () => {
    expect(daysToKeep("refresh", WEEK, 0)).toEqual([2, 4]);
    expect(daysToKeep("refresh", WEEK, 0, new Set([3]))).toEqual([2, 3, 4]);
  });

  it("ignores a lock on a day without a recipe", () => {
    expect(daysToKeep("refresh", WEEK, 0, new Set([1, 5]))).toEqual([2, 4]);
  });

  it("never touches days that have passed", () => {
    // Thursday: Monday to Wednesday are behind us, empty or not.
    expect(daysToKeep("fill", WEEK, 3)).toEqual([0, 1, 2, 3, 4, 6]);
    expect(daysToKeep("refresh", WEEK, 3)).toEqual([0, 1, 2, 4]);
  });

  it("treats a week that has not started as fully open", () => {
    expect(daysToKeep("refresh", WEEK, -4)).toEqual([2, 4]);
  });

  it("does not protect the days of a week that is over", () => {
    expect(daysToKeep("refresh", WEEK, 9)).toEqual([2, 4]);
  });

  it("treats missing days as empty", () => {
    expect(daysToKeep("fill", [], 0)).toEqual([]);
  });
});
