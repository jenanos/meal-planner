import { z } from "zod";

export const Category = z.enum(["FISK", "VEGETAR", "KYLLING", "STORFE", "ANNET"]);

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

export const ShoppingUserRole = z.enum(["INGVILD", "JENS"]);

export const ShoppingViewMode = z.enum([
  "by-day",
  "alphabetical",
  "by-category",
]);

export const IngredientCreate = z.object({
  name: z.string().min(1),
  unit: z.string().min(1).optional(),
  isPantryItem: z.boolean().optional(),
  category: IngredientCategory.optional(),
});

export const IngredientUpdate = IngredientCreate.extend({
  id: z.string().uuid(),
  isPantryItem: z.boolean().optional(),
  category: IngredientCategory.optional(),
});

export const IngredientById = z.object({
  id: z.string().uuid(),
});

export const IngredientListQuery = z.object({
  search: z.string().optional(),
});

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
    }),
  ).default([]),
});

export const RecipeUpdate = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  category: Category.optional(),
  everydayScore: z.number().int().min(1).max(5).optional(),
  healthScore: z.number().int().min(1).max(5).optional(),
  ingredients: z.array(
    z.object({
      name: z.string().min(1),
      quantity: z.union([z.number(), z.string()]).optional(),
      unit: z.string().min(1).optional(),
      notes: z.string().min(1).optional(),
    }),
  ).optional(),
});

export const RecipeListQuery = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(1000).default(20),
  category: Category.optional(),
  search: z.string().optional(),
});

export const PlannerConstraints = z.object({
  fish: z.number().int().min(0).default(2),
  vegetarian: z.number().int().min(0).default(3),
  chicken: z.number().int().min(0).default(1),
  beef: z.number().int().min(0).default(1),
  preferRecentGapDays: z.number().int().min(0).default(21),
});

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
      ]),
    )
    .length(7),
});

export const ExtraItemUpsert = z.object({
  name: z.string().min(1),
});

export const ExtraItemSuggest = z.object({
  search: z.string().optional(),
});

export const ExtraShoppingToggle = z.object({
  weekStart: z.string().min(1),
  name: z.string().min(1),
  checked: z.boolean().optional(),
});

export const ExtraShoppingRemove = z.object({
  weekStart: z.string().min(1),
  name: z.string().min(1),
});

export const ShoppingSettingsGetInput = z.object({
  deviceId: z.string().trim().min(8).max(128),
});

export const ShoppingDeviceRoleUpsert = z.object({
  deviceId: z.string().trim().min(8).max(128),
  role: ShoppingUserRole,
});

export const ShoppingRoleSettingsUpdate = z.object({
  role: ShoppingUserRole,
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

export const ShoppingStoreCreate = z.object({
  name: z.string().trim().min(1).max(80),
  categoryOrder: z.array(IngredientCategory).length(10),
});
