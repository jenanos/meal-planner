-- Store offers on the shopping list, and the products a household wants to be
-- told about when they are on offer. Both are filled in by an assistant
-- through the MCP server (typically a weekly scheduled job).
CREATE TABLE "ShoppingDeal" (
    "id" UUID NOT NULL,
    "catalogItemId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "store" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "regularPrice" TEXT,
    "product" TEXT,
    "validFrom" DATE,
    "validTo" DATE NOT NULL,
    "addedByDeal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingDeal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DealWatchItem" (
    "id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "note" TEXT,
    "householdId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealWatchItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShoppingDeal_catalogItemId_key" ON "ShoppingDeal"("catalogItemId");
CREATE INDEX "ShoppingDeal_householdId_validTo_idx" ON "ShoppingDeal"("householdId", "validTo");
CREATE UNIQUE INDEX "DealWatchItem_name_householdId_key" ON "DealWatchItem"("name", "householdId");

ALTER TABLE "ShoppingDeal" ADD CONSTRAINT "ShoppingDeal_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "ExtraItemCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShoppingDeal" ADD CONSTRAINT "ShoppingDeal_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealWatchItem" ADD CONSTRAINT "DealWatchItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
