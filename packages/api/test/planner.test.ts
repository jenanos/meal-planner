import { describe, it, expect } from "vitest";
import { selectRecipes } from "../src/routers/planner";

describe("planner heuristics", () => {
  it("matches targets when possible", () => {
    const recipes = [
      { id: "1", title: "a", diet: "MEAT" },
      { id: "2", title: "b", diet: "MEAT" },
      { id: "3", title: "c", diet: "MEAT" },
      { id: "4", title: "d", diet: "FISH" },
      { id: "5", title: "e", diet: "FISH" },
      { id: "6", title: "f", diet: "FISH" },
      { id: "7", title: "g", diet: "VEG" },
      { id: "8", title: "h", diet: "VEG" },
      { id: "9", title: "i", diet: "VEG" },
    ];
    const plan = selectRecipes(recipes, { MEAT: 3, FISH: 2, VEG: 2 });
    const counts = plan.reduce(
      (acc, r) => {
        acc[r.diet as "MEAT" | "FISH" | "VEG"]++;
        return acc;
      },
      { MEAT: 0, FISH: 0, VEG: 0 }
    );
    expect(plan).toHaveLength(7);
    expect(counts.MEAT).toBe(3);
    expect(counts.FISH).toBe(2);
    expect(counts.VEG).toBe(2);
  });
});

