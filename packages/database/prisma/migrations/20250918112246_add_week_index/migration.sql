/*
  Warnings:

  - Added the required column `updatedAt` to the `WeekPlan` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "WeekIndex" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekStart" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WeekPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekStart" DATETIME NOT NULL,
    "weekIndexId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WeekPlan_weekIndexId_fkey" FOREIGN KEY ("weekIndexId") REFERENCES "WeekIndex" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WeekPlan" ("createdAt", "id", "weekStart") SELECT "createdAt", "id", "weekStart" FROM "WeekPlan";
DROP TABLE "WeekPlan";
ALTER TABLE "new_WeekPlan" RENAME TO "WeekPlan";
CREATE UNIQUE INDEX "WeekPlan_weekStart_key" ON "WeekPlan"("weekStart");
CREATE UNIQUE INDEX "WeekPlan_weekIndexId_key" ON "WeekPlan"("weekIndexId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "WeekIndex_weekStart_key" ON "WeekIndex"("weekStart");
