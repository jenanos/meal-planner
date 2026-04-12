-- CreateEnum
CREATE TYPE "HouseholdRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Household" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdMember" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "householdId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "HouseholdRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdInvitation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "householdId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "userId" TEXT NOT NULL,
    "defaultViewMode" "ShoppingViewMode" NOT NULL DEFAULT 'BY_DAY',
    "startDay" INTEGER NOT NULL DEFAULT 0,
    "includeNextWeek" BOOLEAN NOT NULL DEFAULT false,
    "showPantryWithIngredients" BOOLEAN NOT NULL DEFAULT false,
    "visibleDayIndices" INTEGER[] NOT NULL DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[],
    "defaultStoreId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("userId")
);

-- Drop obsolete pre-auth preference tables.
DROP TABLE "DevicePreference";
DROP TABLE "ShoppingPreference";
DROP TYPE "ShoppingUserRole";

-- Replace legacy global unique indexes with household-scoped uniques.
DROP INDEX "WeekPlan_weekStart_key";
DROP INDEX "WeekIndex_weekStart_key";
DROP INDEX "ShoppingState_weekStart_ingredientId_unit_key";
DROP INDEX "ExtraItemCatalog_name_key";
DROP INDEX "ExtraShoppingItem_weekStart_catalogItemId_key";
DROP INDEX "ShoppingStore_name_key";
DROP INDEX "ShoppingPackage_name_key";
DROP INDEX "FreezerItem_recipeId_key";

-- Add householdId columns (nullable first for backfill).
ALTER TABLE "WeekPlan" ADD COLUMN "householdId" UUID;
ALTER TABLE "WeekIndex" ADD COLUMN "householdId" UUID;
ALTER TABLE "ShoppingState" ADD COLUMN "householdId" UUID;
ALTER TABLE "ExtraItemCatalog" ADD COLUMN "householdId" UUID;
ALTER TABLE "ExtraShoppingItem" ADD COLUMN "householdId" UUID;
ALTER TABLE "ShoppingStore" ADD COLUMN "householdId" UUID;
ALTER TABLE "ShoppingPackage" ADD COLUMN "householdId" UUID;
ALTER TABLE "FreezerItem" ADD COLUMN "householdId" UUID;

-- If the pre-household schema already contains data, create a default household
-- so existing rows can be preserved during the transition.
INSERT INTO "Household" ("id", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'Migrated Household', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE EXISTS (
    SELECT 1 FROM "WeekPlan"
    UNION ALL
    SELECT 1 FROM "WeekIndex"
    UNION ALL
    SELECT 1 FROM "ShoppingState"
    UNION ALL
    SELECT 1 FROM "ExtraItemCatalog"
    UNION ALL
    SELECT 1 FROM "ExtraShoppingItem"
    UNION ALL
    SELECT 1 FROM "ShoppingStore"
    UNION ALL
    SELECT 1 FROM "ShoppingPackage"
    UNION ALL
    SELECT 1 FROM "FreezerItem"
)
AND NOT EXISTS (
    SELECT 1 FROM "Household"
);

-- Backfill previously global rows into the oldest household.
UPDATE "WeekPlan"
SET "householdId" = (
    SELECT h."id"
    FROM "Household" h
    ORDER BY h."createdAt" ASC
    LIMIT 1
)
WHERE "householdId" IS NULL;

UPDATE "WeekIndex"
SET "householdId" = (
    SELECT h."id"
    FROM "Household" h
    ORDER BY h."createdAt" ASC
    LIMIT 1
)
WHERE "householdId" IS NULL;

UPDATE "ShoppingState"
SET "householdId" = (
    SELECT h."id"
    FROM "Household" h
    ORDER BY h."createdAt" ASC
    LIMIT 1
)
WHERE "householdId" IS NULL;

UPDATE "ExtraItemCatalog"
SET "householdId" = (
    SELECT h."id"
    FROM "Household" h
    ORDER BY h."createdAt" ASC
    LIMIT 1
)
WHERE "householdId" IS NULL;

UPDATE "ExtraShoppingItem"
SET "householdId" = (
    SELECT h."id"
    FROM "Household" h
    ORDER BY h."createdAt" ASC
    LIMIT 1
)
WHERE "householdId" IS NULL;

UPDATE "ShoppingStore"
SET "householdId" = (
    SELECT h."id"
    FROM "Household" h
    ORDER BY h."createdAt" ASC
    LIMIT 1
)
WHERE "householdId" IS NULL;

UPDATE "ShoppingPackage"
SET "householdId" = (
    SELECT h."id"
    FROM "Household" h
    ORDER BY h."createdAt" ASC
    LIMIT 1
)
WHERE "householdId" IS NULL;

UPDATE "FreezerItem"
SET "householdId" = (
    SELECT h."id"
    FROM "Household" h
    ORDER BY h."createdAt" ASC
    LIMIT 1
)
WHERE "householdId" IS NULL;

-- If no household could be created, drop orphaned rows rather than leaving the
-- schema transition half-applied.
DELETE FROM "WeekPlan" WHERE "householdId" IS NULL;
DELETE FROM "WeekIndex" WHERE "householdId" IS NULL;
DELETE FROM "ShoppingState" WHERE "householdId" IS NULL;
DELETE FROM "ExtraShoppingItem" WHERE "householdId" IS NULL;
DELETE FROM "ExtraItemCatalog" WHERE "householdId" IS NULL;
DELETE FROM "ShoppingStore" WHERE "householdId" IS NULL;
DELETE FROM "ShoppingPackage" WHERE "householdId" IS NULL;
DELETE FROM "FreezerItem" WHERE "householdId" IS NULL;

-- Tighten columns after backfill.
ALTER TABLE "WeekPlan" ALTER COLUMN "householdId" SET NOT NULL;
ALTER TABLE "WeekIndex" ALTER COLUMN "householdId" SET NOT NULL;
ALTER TABLE "ShoppingState" ALTER COLUMN "householdId" SET NOT NULL;
ALTER TABLE "ExtraItemCatalog" ALTER COLUMN "householdId" SET NOT NULL;
ALTER TABLE "ExtraShoppingItem" ALTER COLUMN "householdId" SET NOT NULL;
ALTER TABLE "ShoppingStore" ALTER COLUMN "householdId" SET NOT NULL;
ALTER TABLE "ShoppingPackage" ALTER COLUMN "householdId" SET NOT NULL;
ALTER TABLE "FreezerItem" ALTER COLUMN "householdId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE UNIQUE INDEX "HouseholdMember_householdId_userId_key" ON "HouseholdMember"("householdId", "userId");
CREATE INDEX "HouseholdInvitation_email_idx" ON "HouseholdInvitation"("email");
CREATE UNIQUE INDEX "HouseholdInvitation_token_key" ON "HouseholdInvitation"("token");
CREATE INDEX "HouseholdInvitation_token_idx" ON "HouseholdInvitation"("token");
CREATE UNIQUE INDEX "WeekPlan_weekStart_householdId_key" ON "WeekPlan"("weekStart", "householdId");
CREATE UNIQUE INDEX "WeekIndex_weekStart_householdId_key" ON "WeekIndex"("weekStart", "householdId");
CREATE UNIQUE INDEX "ShoppingState_weekStart_ingredientId_unit_householdId_key" ON "ShoppingState"("weekStart", "ingredientId", "unit", "householdId");
CREATE UNIQUE INDEX "ExtraItemCatalog_name_householdId_key" ON "ExtraItemCatalog"("name", "householdId");
CREATE UNIQUE INDEX "ExtraShoppingItem_weekStart_catalogItemId_householdId_key" ON "ExtraShoppingItem"("weekStart", "catalogItemId", "householdId");
CREATE UNIQUE INDEX "ShoppingStore_name_householdId_key" ON "ShoppingStore"("name", "householdId");
CREATE UNIQUE INDEX "ShoppingPackage_name_householdId_key" ON "ShoppingPackage"("name", "householdId");
CREATE UNIQUE INDEX "FreezerItem_recipeId_householdId_key" ON "FreezerItem"("recipeId", "householdId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HouseholdInvitation" ADD CONSTRAINT "HouseholdInvitation_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_defaultStoreId_fkey" FOREIGN KEY ("defaultStoreId") REFERENCES "ShoppingStore"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WeekPlan" ADD CONSTRAINT "WeekPlan_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeekIndex" ADD CONSTRAINT "WeekIndex_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShoppingState" ADD CONSTRAINT "ShoppingState_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExtraItemCatalog" ADD CONSTRAINT "ExtraItemCatalog_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExtraShoppingItem" ADD CONSTRAINT "ExtraShoppingItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShoppingStore" ADD CONSTRAINT "ShoppingStore_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShoppingPackage" ADD CONSTRAINT "ShoppingPackage_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FreezerItem" ADD CONSTRAINT "FreezerItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
