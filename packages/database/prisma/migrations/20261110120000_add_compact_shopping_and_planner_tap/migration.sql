-- Per-user display preferences: a compact shopping list without section frames,
-- and whether tapping a planned meal opens the recipe instead of the picker.
ALTER TABLE "UserPreference"
ADD COLUMN "compactShoppingList" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "plannerTapOpensRecipe" BOOLEAN NOT NULL DEFAULT false;
