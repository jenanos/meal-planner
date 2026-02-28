-- Enable extensions required by the schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS citext;

-- CreateEnum
CREATE TYPE "MealCategory" AS ENUM ('FISK', 'VEGETAR', 'KYLLING', 'STORFE', 'ANNET');

-- CreateEnum
CREATE TYPE "IngredientCategory" AS ENUM ('FRUKT_OG_GRONT', 'KJOTT', 'OST', 'MEIERI_OG_EGG', 'BROD', 'BAKEVARER', 'HERMETIKK', 'TORRVARER', 'HUSHOLDNING', 'ANNET');

-- CreateEnum
CREATE TYPE "WeekPlanEntryType" AS ENUM ('RECIPE', 'TAKEAWAY');

-- CreateEnum
CREATE TYPE "ShoppingViewMode" AS ENUM ('BY_DAY', 'ALPHABETICAL', 'BY_CATEGORY');

-- CreateEnum
CREATE TYPE "ShoppingUserRole" AS ENUM ('INGVILD', 'JENS');

-- CreateTable
CREATE TABLE "Recipe" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" CITEXT NOT NULL,
    "description" TEXT,
    "category" "MealCategory" NOT NULL,
    "everydayScore" INTEGER NOT NULL,
    "healthScore" INTEGER NOT NULL,
    "lastUsed" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" CITEXT NOT NULL,
    "unit" VARCHAR(32),
    "isPantryItem" BOOLEAN NOT NULL DEFAULT false,
    "category" "IngredientCategory" NOT NULL DEFAULT 'ANNET',

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeIngredient" (
    "recipeId" UUID NOT NULL,
    "ingredientId" UUID NOT NULL,
    "quantity" DECIMAL(12,2),
    "notes" TEXT,

    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("recipeId","ingredientId")
);

-- CreateTable
CREATE TABLE "WeekPlan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekIndexId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeekPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeekIndex" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "weekStart" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeekIndex_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeekPlanEntry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "weekPlanId" UUID NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "recipeId" UUID,
    "entryType" "WeekPlanEntryType" NOT NULL DEFAULT 'RECIPE',

    CONSTRAINT "WeekPlanEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingState" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "weekStart" TIMESTAMP(3) NOT NULL,
    "ingredientId" UUID NOT NULL,
    "unit" VARCHAR(32),
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "firstCheckedDayIndex" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtraItemCatalog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" CITEXT NOT NULL,
    "category" "IngredientCategory",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtraItemCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtraShoppingItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "weekStart" TIMESTAMP(3) NOT NULL,
    "catalogItemId" UUID NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtraShoppingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingStore" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" CITEXT NOT NULL,
    "categoryOrder" "IngredientCategory"[] NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingStore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingPreference" (
    "role" "ShoppingUserRole" NOT NULL,
    "defaultViewMode" "ShoppingViewMode" NOT NULL DEFAULT 'BY_DAY',
    "startDay" INTEGER NOT NULL DEFAULT 0,
    "includeNextWeek" BOOLEAN NOT NULL DEFAULT false,
    "showPantryWithIngredients" BOOLEAN NOT NULL DEFAULT false,
    "visibleDayIndices" INTEGER[] NOT NULL DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[],
    "defaultStoreId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingPreference_pkey" PRIMARY KEY ("role")
);

-- CreateTable
CREATE TABLE "DevicePreference" (
    "deviceId" VARCHAR(128) NOT NULL,
    "role" "ShoppingUserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevicePreference_pkey" PRIMARY KEY ("deviceId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_name_key" ON "Recipe"("name");

-- CreateIndex
CREATE INDEX "Recipe_category_idx" ON "Recipe"("category");

-- CreateIndex
CREATE INDEX "Recipe_lastUsed_idx" ON "Recipe"("lastUsed");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_name_key" ON "Ingredient"("name");

-- CreateIndex
CREATE INDEX "Ingredient_category_idx" ON "Ingredient"("category");

-- CreateIndex
CREATE UNIQUE INDEX "WeekPlan_weekStart_key" ON "WeekPlan"("weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "WeekPlan_weekIndexId_key" ON "WeekPlan"("weekIndexId");

-- CreateIndex
CREATE UNIQUE INDEX "WeekIndex_weekStart_key" ON "WeekIndex"("weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "WeekPlanEntry_weekPlanId_dayIndex_key" ON "WeekPlanEntry"("weekPlanId", "dayIndex");

-- CreateIndex
CREATE INDEX "ShoppingState_weekStart_idx" ON "ShoppingState"("weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingState_weekStart_ingredientId_unit_key" ON "ShoppingState"("weekStart", "ingredientId", "unit");

-- CreateIndex
CREATE UNIQUE INDEX "ExtraItemCatalog_name_key" ON "ExtraItemCatalog"("name");

-- CreateIndex
CREATE INDEX "ExtraItemCatalog_category_idx" ON "ExtraItemCatalog"("category");

-- CreateIndex
CREATE INDEX "ExtraShoppingItem_weekStart_idx" ON "ExtraShoppingItem"("weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "ExtraShoppingItem_weekStart_catalogItemId_key" ON "ExtraShoppingItem"("weekStart", "catalogItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingStore_name_key" ON "ShoppingStore"("name");

-- CreateIndex
CREATE INDEX "ShoppingStore_isDefault_idx" ON "ShoppingStore"("isDefault");

-- CreateIndex
CREATE INDEX "ShoppingPreference_defaultStoreId_idx" ON "ShoppingPreference"("defaultStoreId");

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekPlan" ADD CONSTRAINT "WeekPlan_weekIndexId_fkey" FOREIGN KEY ("weekIndexId") REFERENCES "WeekIndex"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekPlanEntry" ADD CONSTRAINT "WeekPlanEntry_weekPlanId_fkey" FOREIGN KEY ("weekPlanId") REFERENCES "WeekPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekPlanEntry" ADD CONSTRAINT "WeekPlanEntry_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraShoppingItem" ADD CONSTRAINT "ExtraShoppingItem_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "ExtraItemCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingPreference" ADD CONSTRAINT "ShoppingPreference_defaultStoreId_fkey" FOREIGN KEY ("defaultStoreId") REFERENCES "ShoppingStore"("id") ON DELETE SET NULL ON UPDATE CASCADE;
