-- CreateTable
CREATE TABLE "ShoppingPackage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" CITEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingPackageItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "packageId" UUID NOT NULL,
    "extraItemCatalogId" UUID,
    "ingredientId" UUID,
    "displayName" CITEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShoppingPackageItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingPackage_name_key" ON "ShoppingPackage"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingPackageItem_packageId_extraItemCatalogId_key" ON "ShoppingPackageItem"("packageId", "extraItemCatalogId");

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingPackageItem_packageId_ingredientId_key" ON "ShoppingPackageItem"("packageId", "ingredientId");

-- CreateIndex
CREATE INDEX "ShoppingPackageItem_packageId_idx" ON "ShoppingPackageItem"("packageId");

-- AddForeignKey
ALTER TABLE "ShoppingPackageItem" ADD CONSTRAINT "ShoppingPackageItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ShoppingPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingPackageItem" ADD CONSTRAINT "ShoppingPackageItem_extraItemCatalogId_fkey" FOREIGN KEY ("extraItemCatalogId") REFERENCES "ExtraItemCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingPackageItem" ADD CONSTRAINT "ShoppingPackageItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
