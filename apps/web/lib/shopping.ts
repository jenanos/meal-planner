export const SHOPPING_VIEW_MODES = [
  "by-day",
  "alphabetical",
  "by-category",
] as const;

export type ShoppingViewMode = (typeof SHOPPING_VIEW_MODES)[number];

export const SHOPPING_USER_ROLES = ["INGVILD", "JENS"] as const;
export type ShoppingUserRole = (typeof SHOPPING_USER_ROLES)[number];

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

export const DEFAULT_VISIBLE_DAY_INDICES = [0, 1, 2, 3, 4, 5, 6] as const;

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

export function shoppingRoleLabel(role: ShoppingUserRole) {
  if (role === "INGVILD") return "Ingvild";
  return "Jens";
}
