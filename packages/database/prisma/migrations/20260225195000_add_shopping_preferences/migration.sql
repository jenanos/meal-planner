-- CreateEnum
CREATE TYPE "ShoppingViewMode" AS ENUM ('BY_DAY', 'ALPHABETICAL', 'BY_CATEGORY');

-- CreateEnum
CREATE TYPE "ShoppingUserRole" AS ENUM ('INGVILD', 'JENS');

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
    "visibleDayIndices" INTEGER[] NOT NULL DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6],
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
CREATE UNIQUE INDEX "ShoppingStore_name_key" ON "ShoppingStore"("name");

-- CreateIndex
CREATE INDEX "ShoppingStore_isDefault_idx" ON "ShoppingStore"("isDefault");

-- CreateIndex
CREATE INDEX "ShoppingPreference_defaultStoreId_idx" ON "ShoppingPreference"("defaultStoreId");

-- AddForeignKey
ALTER TABLE "ShoppingPreference" ADD CONSTRAINT "ShoppingPreference_defaultStoreId_fkey" FOREIGN KEY ("defaultStoreId") REFERENCES "ShoppingStore"("id") ON DELETE SET NULL ON UPDATE CASCADE;
