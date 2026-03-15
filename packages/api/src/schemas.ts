import { z } from "zod";

// (Hvis ikke allerede definert)
export const Category = z.enum(["FISK", "VEGETAR", "KYLLING", "STORFE", "ANNET"]);
export type Category = z.infer<typeof Category>;

export const IngredientCategory = z.enum([
  "FRUKT_OG_GRONT",
  "KJOTT",
  "OST",
  "MEIERI_OG_EGG",
  "BROD",
  "BAKEVARER",
  "HERMETIKK",
  "TORRVARER",
  "HUSHOLDNING",
  "ANNET",
]);
export type IngredientCategory = z.infer<typeof IngredientCategory>;

export const ShoppingViewMode = z.enum([
  "by-day",
  "alphabetical",
  "by-category",
]);
export type ShoppingViewMode = z.infer<typeof ShoppingViewMode>;

export const IngredientCreate = z.object({
  name: z.string().min(1),
  unit: z.string().min(1).optional(),
  isPantryItem: z.boolean().optional(),
  category: IngredientCategory.optional(),
});
export type IngredientCreate = z.infer<typeof IngredientCreate>;

export const IngredientUpdate = IngredientCreate.extend({
  id: z.string().uuid(),
  isPantryItem: z.boolean().optional(),
  category: IngredientCategory.optional(),
});
export type IngredientUpdate = z.infer<typeof IngredientUpdate>;

export const IngredientById = z.object({
  id: z.string().uuid(),
});
export type IngredientById = z.infer<typeof IngredientById>;

export const IngredientListQuery = z.object({
  search: z.string().optional(),
});
export type IngredientListQuery = z.infer<typeof IngredientListQuery>;

// (Hvis ikke allerede finnes)
export const RecipeCreate = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: Category,
  everydayScore: z.number().int().min(1).max(5),
  healthScore: z.number().int().min(1).max(5),
  ingredients: z.array(
    z.object({
      name: z.string().min(1),
      quantity: z.union([z.number(), z.string()]).optional(),
      unit: z.string().min(1).optional(),
      notes: z.string().min(1).optional(),
    })
  ).default([]),
});
export type RecipeCreate = z.infer<typeof RecipeCreate>;

export const RecipeUpdate = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  category: Category.optional(),
  everydayScore: z.number().int().min(1).max(5).optional(),
  healthScore: z.number().int().min(1).max(5).optional(),
  ingredients: z.array(
    z.object({
      name: z.string().min(1),
      quantity: z.union([z.number(), z.string()]).optional(),
      unit: z.string().min(1).optional(),
      notes: z.string().min(1).optional(),
    })
  ).optional(),
});
export type RecipeUpdate = z.infer<typeof RecipeUpdate>;

export const RecipeListQuery = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(1000).default(20),
  category: Category.optional(),
  search: z.string().optional(),
});
export type RecipeListQuery = z.infer<typeof RecipeListQuery>;

export const PlannerConstraints = z.object({
  fish: z.number().int().min(0).default(2),
  vegetarian: z.number().int().min(0).default(3),
  chicken: z.number().int().min(0).default(1),
  beef: z.number().int().min(0).default(1),
  preferRecentGapDays: z.number().int().min(0).default(21),
});
export type PlannerConstraints = z.infer<typeof PlannerConstraints>;

export const WeekPlanInput = z.object({
  weekStart: z.string().min(1),
  days: z
    .array(
      z.union([
        z.object({
          type: z.literal("RECIPE"),
          recipeId: z.string().uuid(),
        }),
        z.object({
          type: z.literal("TAKEAWAY"),
        }),
        z.object({
          type: z.literal("EMPTY"),
        }),
      ])
    )
    .length(7),
});
export type WeekPlanInput = z.infer<typeof WeekPlanInput>;

// Extra shopping items
export const ExtraItemUpsert = z.object({
  name: z.string().min(1),
});
export type ExtraItemUpsert = z.infer<typeof ExtraItemUpsert>;

export const ExtraItemSuggest = z.object({
  search: z.string().optional(),
});
export type ExtraItemSuggest = z.infer<typeof ExtraItemSuggest>;

export const ExtraCatalogCategoryUpdate = z.object({
  id: z.string().uuid(),
  category: IngredientCategory.nullable(),
});
export type ExtraCatalogCategoryUpdate = z.infer<
  typeof ExtraCatalogCategoryUpdate
>;

export const ExtraCatalogBulkCategoryUpdate = z.object({
  updates: z.array(ExtraCatalogCategoryUpdate).min(1),
});
export type ExtraCatalogBulkCategoryUpdate = z.infer<
  typeof ExtraCatalogBulkCategoryUpdate
>;

export const ExtraShoppingToggle = z.object({
  weekStart: z.string().min(1),
  name: z.string().min(1),
  checked: z.boolean().optional(),
});
export type ExtraShoppingToggle = z.infer<typeof ExtraShoppingToggle>;

export const ExtraShoppingRemove = z.object({
  weekStart: z.string().min(1),
  name: z.string().min(1),
});
export type ExtraShoppingRemove = z.infer<typeof ExtraShoppingRemove>;

// ─── User preference schemas (replaces device/role-based schemas) ───

export const UserPreferenceUpdate = z.object({
  defaultViewMode: ShoppingViewMode,
  startDay: z.number().int().min(0).max(6),
  includeNextWeek: z.boolean(),
  showPantryWithIngredients: z.boolean(),
  visibleDayIndices: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .max(7),
  defaultStoreId: z.string().uuid().nullable().optional(),
});
export type UserPreferenceUpdate = z.infer<typeof UserPreferenceUpdate>;

export const ShoppingStoreCreate = z.object({
  name: z.string().trim().min(1).max(80),
  categoryOrder: z.array(IngredientCategory).length(IngredientCategory.options.length),
});
export type ShoppingStoreCreate = z.infer<typeof ShoppingStoreCreate>;
