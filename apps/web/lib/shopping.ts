export const SHOPPING_VIEW_MODES = [
  "by-day",
  "alphabetical",
  "by-category",
] as const;

export type ShoppingViewMode = (typeof SHOPPING_VIEW_MODES)[number];

export const SHOPPING_USER_ROLES = ["INGVILD", "JENS"] as const;
export type ShoppingUserRole = (typeof SHOPPING_USER_ROLES)[number];

export const INGREDIENT_CATEGORIES = [
  "FRUKT",
  "GRONNSAKER",
  "KJOTT",
  "OST",
  "BROD",
  "MEIERI_OG_EGG",
  "HERMETIKK",
  "TORRVARER",
  "BAKEVARER",
  "ANNET",
] as const;

export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];

export const STANDARD_STORE_NAME = "Standard butikk";

export const STANDARD_STORE_CATEGORY_ORDER: IngredientCategory[] = [
  "FRUKT",
  "GRONNSAKER",
  "KJOTT",
  "OST",
  "BROD",
  "MEIERI_OG_EGG",
  "HERMETIKK",
  "TORRVARER",
  "BAKEVARER",
  "ANNET",
];

export const DEFAULT_VISIBLE_DAY_INDICES = [0, 1, 2, 3, 4, 5, 6] as const;

const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  FRUKT: "Frukt",
  GRONNSAKER: "Grønnsaker",
  KJOTT: "Kjøtt og fisk",
  OST: "Ost",
  BROD: "Brød",
  MEIERI_OG_EGG: "Meieri og egg",
  HERMETIKK: "Hermetikk",
  TORRVARER: "Tørrvarer",
  BAKEVARER: "Bakevarer",
  ANNET: "Annet",
};

export function ingredientCategoryLabel(category: string | null | undefined) {
  if (!category) return CATEGORY_LABELS.ANNET;
  const upper = category.toUpperCase() as IngredientCategory;
  return CATEGORY_LABELS[upper] ?? CATEGORY_LABELS.ANNET;
}

export function normalizeCategoryOrder(values: string[] | undefined) {
  const unique: IngredientCategory[] = [];
  for (const value of values ?? []) {
    const upper = value.toUpperCase() as IngredientCategory;
    if (!INGREDIENT_CATEGORIES.includes(upper)) continue;
    if (!unique.includes(upper)) {
      unique.push(upper);
    }
  }
  for (const category of STANDARD_STORE_CATEGORY_ORDER) {
    if (!unique.includes(category)) {
      unique.push(category);
    }
  }
  return unique;
}

export function shoppingRoleLabel(role: ShoppingUserRole) {
  if (role === "INGVILD") return "Ingvild";
  return "Jens";
}

