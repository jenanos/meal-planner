-- AlterEnum
ALTER TYPE "WeekPlanEntryType" ADD VALUE 'FREEZER';

-- CreateTable
CREATE TABLE "FreezerItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipeId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FreezerItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FreezerItem_recipeId_key" ON "FreezerItem"("recipeId");

-- AddForeignKey
ALTER TABLE "FreezerItem" ADD CONSTRAINT "FreezerItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
