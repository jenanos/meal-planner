-- CreateEnum
CREATE TYPE "IngredientCategory" AS ENUM ('FRUKT', 'GRONNSAKER', 'KJOTT', 'OST', 'MEIERI_OG_EGG', 'BROD', 'BAKEVARER', 'HERMETIKK', 'TORRVARER', 'UKATEGORISERT');

-- AlterTable
ALTER TABLE "Ingredient"
ADD COLUMN "category" "IngredientCategory" NOT NULL DEFAULT 'UKATEGORISERT';

-- CreateIndex
CREATE INDEX "Ingredient_category_idx" ON "Ingredient"("category");
