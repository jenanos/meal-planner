-- CreateTable
CREATE TABLE "ShoppingState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekStart" DATETIME NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "unit" TEXT,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingState_weekStart_ingredientId_unit_key" ON "ShoppingState"("weekStart", "ingredientId", "unit");
