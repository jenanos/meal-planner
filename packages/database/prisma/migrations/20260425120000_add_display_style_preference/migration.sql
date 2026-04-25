-- Add display-style preference (list/grid) to user preferences.
CREATE TYPE "ShoppingDisplayStyle" AS ENUM ('LIST', 'GRID');

ALTER TABLE "UserPreference"
ADD COLUMN "defaultDisplayStyle" "ShoppingDisplayStyle" NOT NULL DEFAULT 'LIST';
