-- Merge FRUKT + GRONNSAKER into FRUKT_OG_GRONT and add HUSHOLDNING.

CREATE TYPE "IngredientCategory_new" AS ENUM (
  'FRUKT_OG_GRONT',
  'KJOTT',
  'OST',
  'MEIERI_OG_EGG',
  'BROD',
  'BAKEVARER',
  'HERMETIKK',
  'TORRVARER',
  'HUSHOLDNING',
  'ANNET'
);

ALTER TABLE "Ingredient"
ALTER COLUMN "category" DROP DEFAULT;

ALTER TABLE "Ingredient"
ALTER COLUMN "category" TYPE "IngredientCategory_new"
USING (
  CASE
    WHEN "category"::text IN ('FRUKT', 'GRONNSAKER') THEN 'FRUKT_OG_GRONT'
    WHEN "category"::text = 'UKATEGORISERT' THEN 'ANNET'
    ELSE "category"::text
  END
)::"IngredientCategory_new";

ALTER TABLE "ShoppingStore"
ALTER COLUMN "categoryOrder" TYPE "IngredientCategory_new"[]
USING (
  ARRAY(
    SELECT CASE
      WHEN category::text IN ('FRUKT', 'GRONNSAKER') THEN 'FRUKT_OG_GRONT'
      WHEN category::text = 'UKATEGORISERT' THEN 'ANNET'
      ELSE category::text
    END
    FROM unnest("categoryOrder") AS category
  )
)::"IngredientCategory_new"[];

ALTER TYPE "IngredientCategory" RENAME TO "IngredientCategory_old";
ALTER TYPE "IngredientCategory_new" RENAME TO "IngredientCategory";
DROP TYPE "IngredientCategory_old";

ALTER TABLE "Ingredient"
ALTER COLUMN "category" SET DEFAULT 'ANNET';

-- Ensure standard store order has HUSHOLDNING as second last before ANNET.
UPDATE "ShoppingStore"
SET "categoryOrder" = ARRAY[
  'FRUKT_OG_GRONT',
  'KJOTT',
  'OST',
  'BROD',
  'MEIERI_OG_EGG',
  'HERMETIKK',
  'TORRVARER',
  'BAKEVARER',
  'HUSHOLDNING',
  'ANNET'
]::"IngredientCategory"[]
WHERE "name" = 'Standard butikk';
