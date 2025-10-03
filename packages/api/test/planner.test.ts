import { describe, it, expect } from "vitest";
import { selectRecipes } from "../src/routers/planner";

const NORMALIZED_KEYS = ["FISK", "VEGETAR", "KYLLING", "STORFE", "ANNET"] as const;

function normalizeCategory(value: string) {
  const upper = value.toUpperCase();
  if (upper === "MEAT" || upper === "BEEF" || upper === "STORFE") return "STORFE";
  if (upper === "CHICKEN" || upper === "KYLLING") return "KYLLING";
  if (upper === "FISH" || upper === "FISK") return "FISK";
  if (upper === "VEG" || upper === "VEGETAR" || upper === "VEGETARIAN") return "VEGETAR";
  return "ANNET";
}

function countByCategory(recipes: { diet: string }[]) {
  return recipes.reduce(
    (acc, recipe) => {
      const key = normalizeCategory(String(recipe.diet));
      acc[key]++;
      return acc;
    },
    NORMALIZED_KEYS.reduce(
      (acc, key) => {
        acc[key] = 0;
        return acc;
      },
      {} as Record<(typeof NORMALIZED_KEYS)[number], number>
    )
  );
}

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

  it("normalizes diet inputs and target keys", () => {
    const recipes = [
      { id: "f1", diet: "fisk" },
      { id: "f2", diet: "Fish" },
      { id: "v1", diet: "vegetarian" },
      { id: "c1", diet: "kylling" },
      { id: "c2", diet: "Chicken" },
      { id: "b1", diet: "meat" },
      { id: "b2", diet: "Storfe" },
    ];

    const plan = selectRecipes(recipes, {
      FISK: 2,
      VEGETAR: 1,
      KYLLING: 2,
      STORFE: 2,
    });

    expect(plan).toHaveLength(7);
    expect(new Set(plan.map((r) => r.id))).toEqual(
      new Set(["f1", "f2", "v1", "c1", "c2", "b1", "b2"])
    );
  });

  it("fills remaining days when requested categories are missing", () => {
    const recipes = [
      { id: "f1", diet: "FISH" },
      { id: "f2", diet: "FISH" },
      { id: "v1", diet: "VEGETAR" },
      { id: "m1", diet: "MEAT" },
      { id: "m2", diet: "MEAT" },
      { id: "m3", diet: "MEAT" },
      { id: "m4", diet: "MEAT" },
    ];

    const plan = selectRecipes(recipes, { FISH: 3, VEGETAR: 2 });
    const counts = countByCategory(plan);

    expect(plan).toHaveLength(7);
    expect(counts.FISK).toBe(2);
    expect(counts.VEGETAR).toBe(1);
    expect(counts.STORFE).toBe(4);
  });

  it("throws when there are not enough unique recipes", () => {
    const recipes = [
      { id: "1", diet: "MEAT" },
      { id: "2", diet: "MEAT" },
      { id: "3", diet: "MEAT" },
      { id: "4", diet: "FISH" },
      { id: "5", diet: "FISH" },
      { id: "6", diet: "VEG" },
    ];

    expect(() => selectRecipes(recipes, {})).toThrowError(
      /No recipes available/
    );
  });

  it("respects english aliases in targets", () => {
    const recipes = [
      { id: "c1", diet: "chicken" },
      { id: "c2", diet: "CHICKEN" },
      { id: "c3", diet: "Kylling" },
      { id: "b1", diet: "beef" },
      { id: "b2", diet: "MEAT" },
      { id: "b3", diet: "storfe" },
      { id: "b4", diet: "BEEF" },
    ];

    const plan = selectRecipes(recipes, { CHICKEN: 3, BEEF: 4 });
    const counts = countByCategory(plan);

    expect(counts.KYLLING).toBe(3);
    expect(counts.STORFE).toBe(4);
  });

  it("preserves extra fields while returning copies", () => {
    const recipes = [
      { id: "r1", diet: "FISH", title: "Fish 1", metadata: { note: 1 } },
      { id: "r2", diet: "FISH", title: "Fish 2", metadata: { note: 2 } },
      { id: "r3", diet: "FISH", title: "Fish 3", metadata: { note: 3 } },
      { id: "r4", diet: "VEGETAR", title: "Veg 4", metadata: { note: 4 } },
      { id: "r5", diet: "VEGETAR", title: "Veg 5", metadata: { note: 5 } },
      { id: "r6", diet: "VEGETAR", title: "Veg 6", metadata: { note: 6 } },
      { id: "r7", diet: "VEGETAR", title: "Veg 7", metadata: { note: 7 } },
    ];

    const plan = selectRecipes(recipes, { FISH: 3, VEGETAR: 4 });
    const byId = new Map(plan.map((recipe) => [recipe.id, recipe]));

    for (const original of recipes) {
      const selected = byId.get(original.id);
      expect(selected).toBeDefined();
      expect(selected).not.toBe(original);
      expect(selected).toMatchObject({
        title: original.title,
        metadata: original.metadata,
      });
    }
  });

  it("falls back to other categories when only unspecified diets exist", () => {
    const recipes = Array.from({ length: 7 }, (_, index) => ({
      id: `u${index}`,
      diet: index % 2 ? "pasta" : "dessert",
    }));

    const plan = selectRecipes(recipes, { FISK: 3 });
    const counts = countByCategory(plan);

    expect(counts.FISK).toBe(0);
    expect(counts.ANNET).toBe(7);
  });
});
