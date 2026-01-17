-- CreateEnum
CREATE TYPE "WeekPlanEntryType" AS ENUM ('RECIPE', 'TAKEAWAY');

-- AlterTable
ALTER TABLE "WeekPlanEntry"
ADD COLUMN     "entryType" "WeekPlanEntryType" NOT NULL DEFAULT 'RECIPE',
ALTER COLUMN "recipeId" DROP NOT NULL;
