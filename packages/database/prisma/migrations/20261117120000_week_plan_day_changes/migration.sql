-- The last change a person made by hand to each day of a week plan, shown on
-- the day's card so a deliberate choice is not mistaken for a generated one.
CREATE TYPE "WeekPlanChangeKind" AS ENUM ('ADDED', 'REPLACED', 'MOVED', 'MOVED_OUT', 'REMOVED');

CREATE TABLE "WeekPlanDayChange" (
    "id" UUID NOT NULL,
    "weekPlanId" UUID NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "kind" "WeekPlanChangeKind" NOT NULL,
    "otherDayIndex" INTEGER,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeekPlanDayChange_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WeekPlanDayChange_weekPlanId_dayIndex_key" ON "WeekPlanDayChange"("weekPlanId", "dayIndex");

ALTER TABLE "WeekPlanDayChange" ADD CONSTRAINT "WeekPlanDayChange_weekPlanId_fkey" FOREIGN KEY ("weekPlanId") REFERENCES "WeekPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WeekPlanDayChange" ADD CONSTRAINT "WeekPlanDayChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
