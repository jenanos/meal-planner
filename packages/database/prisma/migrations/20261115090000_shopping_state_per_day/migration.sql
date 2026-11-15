-- Shopping items are now checked off per planned day instead of per week, so
-- buying for the next three days no longer marks the rest of the week as
-- bought. "checked" stays as "at least one day is checked".
ALTER TABLE "ShoppingState"
ADD COLUMN "checkedDayIndices" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

-- Until now a checked row covered the whole week.
UPDATE "ShoppingState"
SET "checkedDayIndices" = ARRAY[0, 1, 2, 3, 4, 5, 6]
WHERE "checked" = true;
