ALTER TABLE "ExtraItemCatalog"
ADD COLUMN "category" "IngredientCategory";

CREATE INDEX "ExtraItemCatalog_category_idx"
ON "ExtraItemCatalog"("category");
