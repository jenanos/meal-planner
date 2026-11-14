-- The shopping list now shows a rolling window starting today instead of a
-- calendar week filtered by start day and weekday selection. The horizon says
-- how far ahead that window reaches. "includeNextWeek" and "visibleDayIndices"
-- are no longer read; "startDay" now only sets where the week planner starts.
CREATE TYPE "ShoppingHorizon" AS ENUM ('TODAY', 'THREE_DAYS', 'REST_OF_WEEK', 'SEVEN_DAYS', 'FOURTEEN_DAYS');

ALTER TABLE "UserPreference"
ADD COLUMN "shoppingHorizon" "ShoppingHorizon" NOT NULL DEFAULT 'SEVEN_DAYS';

-- Users who shopped for two weeks at a time keep a long window.
UPDATE "UserPreference"
SET "shoppingHorizon" = 'FOURTEEN_DAYS'
WHERE "includeNextWeek" = true;
