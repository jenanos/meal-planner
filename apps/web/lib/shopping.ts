export const SHOPPING_VIEW_MODES = [
  "by-day",
  "alphabetical",
  "by-category",
] as const;

export type ShoppingViewMode = (typeof SHOPPING_VIEW_MODES)[number];

export const SHOPPING_DISPLAY_STYLES = ["list", "grid"] as const;
export type ShoppingDisplayStyle = (typeof SHOPPING_DISPLAY_STYLES)[number];

export const INGREDIENT_CATEGORIES = [
  "FRUKT_OG_GRONT",
  "KJOTT",
  "OST",
  "BROD",
  "MEIERI_OG_EGG",
  "HERMETIKK",
  "TORRVARER",
  "BAKEVARER",
  "HUSHOLDNING",
  "ANNET",
] as const;

export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];

export const STANDARD_STORE_NAME = "Standard butikk";

export const STANDARD_STORE_CATEGORY_ORDER: IngredientCategory[] = [
  "FRUKT_OG_GRONT",
  "KJOTT",
  "OST",
  "BROD",
  "MEIERI_OG_EGG",
  "HERMETIKK",
  "TORRVARER",
  "BAKEVARER",
  "HUSHOLDNING",
  "ANNET",
];

// How far ahead of today the shopping list reaches.
export const SHOPPING_HORIZONS = [
  "today",
  "three-days",
  "rest-of-week",
  "seven-days",
  "fourteen-days",
] as const;
export type ShoppingHorizon = (typeof SHOPPING_HORIZONS)[number];

export const DEFAULT_SHOPPING_HORIZON: ShoppingHorizon = "seven-days";

export const SHOPPING_HORIZON_LABELS: Record<ShoppingHorizon, string> = {
  today: "I dag",
  "three-days": "3 dager",
  "rest-of-week": "Ut uken",
  "seven-days": "7 dager",
  "fourteen-days": "14 dager",
};

export function isShoppingHorizon(value: unknown): value is ShoppingHorizon {
  return (
    typeof value === "string" &&
    (SHOPPING_HORIZONS as readonly string[]).includes(value)
  );
}

const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  FRUKT_OG_GRONT: "Frukt og grønt",
  KJOTT: "Kjøtt og fisk",
  OST: "Ost",
  BROD: "Brød",
  MEIERI_OG_EGG: "Meieri og egg",
  HERMETIKK: "Hermetikk",
  TORRVARER: "Tørrvarer",
  BAKEVARER: "Bakevarer",
  HUSHOLDNING: "Husholdning",
  ANNET: "Annet",
};

function normalizeIngredientCategory(
  category: string | null | undefined,
): IngredientCategory {
  if (!category) return "ANNET";
  const upper = category.toUpperCase();
  if (upper === "UKATEGORISERT") return "ANNET";
  if (upper === "FRUKT" || upper === "GRONNSAKER") return "FRUKT_OG_GRONT";
  if (INGREDIENT_CATEGORIES.includes(upper as IngredientCategory)) {
    return upper as IngredientCategory;
  }
  return "ANNET";
}

export function ingredientCategoryLabel(category: string | null | undefined) {
  return CATEGORY_LABELS[normalizeIngredientCategory(category)];
}

export function normalizeCategoryOrder(
  values: string[] | undefined,
): IngredientCategory[] {
  const unique: IngredientCategory[] = [];
  for (const value of values ?? []) {
    const category = normalizeIngredientCategory(value);
    if (!unique.includes(category)) {
      unique.push(category);
    }
  }
  for (const category of STANDARD_STORE_CATEGORY_ORDER) {
    if (!unique.includes(category)) {
      unique.push(category);
    }
  }
  return [...unique.filter((category) => category !== "ANNET"), "ANNET"];
}
