-- DropIndex (old global unique on name)
DROP INDEX "ShoppingPackage_name_key";

-- AlterTable: add householdId column (nullable first for backfill)
ALTER TABLE "ShoppingPackage" ADD COLUMN "householdId" UUID;

-- Backfill: assign each package to the household of the user who created
-- the earliest extra-item referencing that package's items, or fall back
-- to the oldest household.
UPDATE "ShoppingPackage" sp
SET "householdId" = COALESCE(
  (
    SELECT esi."householdId"
    FROM "ShoppingPackageItem" spi
    JOIN "ExtraItemCatalog" eic ON eic."id" = spi."extraItemCatalogId"
    JOIN "ExtraShoppingItem" esi ON esi."catalogItemId" = eic."id"
    WHERE spi."packageId" = sp."id"
    ORDER BY esi."createdAt" ASC
    LIMIT 1
  ),
  (SELECT h."id" FROM "Household" h ORDER BY h."createdAt" ASC LIMIT 1)
);

-- Delete any orphaned packages that could not be assigned (no households exist)
DELETE FROM "ShoppingPackage" WHERE "householdId" IS NULL;

-- Make householdId NOT NULL
ALTER TABLE "ShoppingPackage" ALTER COLUMN "householdId" SET NOT NULL;

-- CreateIndex: composite unique on name + householdId
CREATE UNIQUE INDEX "ShoppingPackage_name_householdId_key" ON "ShoppingPackage"("name", "householdId");

-- AddForeignKey
ALTER TABLE "ShoppingPackage" ADD CONSTRAINT "ShoppingPackage_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
