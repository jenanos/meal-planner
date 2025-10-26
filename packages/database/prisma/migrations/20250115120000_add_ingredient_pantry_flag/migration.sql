-- AlterTable
ALTER TABLE "Ingredient"
ADD COLUMN "isPantryItem" BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing rows with the default and keep the default for future inserts
UPDATE "Ingredient" SET "isPantryItem" = COALESCE("isPantryItem", false);
