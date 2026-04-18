-- Normalize the production cutover household so historical household-scoped
-- data belongs to a real household with the intended members.

-- Reuse the legacy migrated household when possible so existing row ids stay
-- stable across the cutover.
UPDATE "Household"
SET "name" = 'Osberg Ottemo',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'Migrated Household'
  AND NOT EXISTS (
    SELECT 1
    FROM "Household"
    WHERE "name" = 'Osberg Ottemo'
  );

INSERT INTO "Household" ("id", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'Osberg Ottemo', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM "Household"
  WHERE "name" = 'Osberg Ottemo'
);

INSERT INTO "AllowedEmail" ("id", "email", "createdAt")
VALUES
  (gen_random_uuid(), 'bootstrap-owner@example.invalid', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'bootstrap-member@example.invalid', CURRENT_TIMESTAMP)
ON CONFLICT ("email") DO NOTHING;

INSERT INTO "User" (
  "id",
  "name",
  "email",
  "emailVerified",
  "role",
  "createdAt",
  "updatedAt"
)
VALUES
  (
    'cutover-jens-osberg',
    'Jens Osberg',
    'bootstrap-owner@example.invalid',
    true,
    'ADMIN',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'cutover-ingvild-ottemo',
    'Ingvild Ottemo',
    'bootstrap-member@example.invalid',
    true,
    'USER',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("email") DO UPDATE
SET "emailVerified" = true,
    "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "User"
SET "role" = 'ADMIN',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "email" = 'bootstrap-owner@example.invalid';

UPDATE "WeekPlan"
SET "householdId" = (
  SELECT "id"
  FROM "Household"
  WHERE "name" = 'Osberg Ottemo'
  ORDER BY "createdAt" ASC
  LIMIT 1
)
WHERE "householdId" IN (
  SELECT h."id"
  FROM "Household" h
  WHERE h."name" <> 'Osberg Ottemo'
    AND NOT EXISTS (
      SELECT 1
      FROM "HouseholdMember" hm
      WHERE hm."householdId" = h."id"
    )
    AND (
      EXISTS (SELECT 1 FROM "WeekPlan" wp WHERE wp."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "WeekIndex" wi WHERE wi."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ShoppingState" ss WHERE ss."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ExtraItemCatalog" eic WHERE eic."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ExtraShoppingItem" esi WHERE esi."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ShoppingStore" store WHERE store."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ShoppingPackage" sp WHERE sp."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "FreezerItem" fi WHERE fi."householdId" = h."id")
    )
);

UPDATE "WeekIndex"
SET "householdId" = (
  SELECT "id"
  FROM "Household"
  WHERE "name" = 'Osberg Ottemo'
  ORDER BY "createdAt" ASC
  LIMIT 1
)
WHERE "householdId" IN (
  SELECT h."id"
  FROM "Household" h
  WHERE h."name" <> 'Osberg Ottemo'
    AND NOT EXISTS (
      SELECT 1
      FROM "HouseholdMember" hm
      WHERE hm."householdId" = h."id"
    )
    AND (
      EXISTS (SELECT 1 FROM "WeekPlan" wp WHERE wp."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "WeekIndex" wi WHERE wi."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ShoppingState" ss WHERE ss."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ExtraItemCatalog" eic WHERE eic."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ExtraShoppingItem" esi WHERE esi."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ShoppingStore" store WHERE store."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ShoppingPackage" sp WHERE sp."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "FreezerItem" fi WHERE fi."householdId" = h."id")
    )
);

UPDATE "ShoppingState"
SET "householdId" = (
  SELECT "id"
  FROM "Household"
  WHERE "name" = 'Osberg Ottemo'
  ORDER BY "createdAt" ASC
  LIMIT 1
)
WHERE "householdId" IN (
  SELECT h."id"
  FROM "Household" h
  WHERE h."name" <> 'Osberg Ottemo'
    AND NOT EXISTS (
      SELECT 1
      FROM "HouseholdMember" hm
      WHERE hm."householdId" = h."id"
    )
    AND (
      EXISTS (SELECT 1 FROM "WeekPlan" wp WHERE wp."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "WeekIndex" wi WHERE wi."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ShoppingState" ss WHERE ss."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ExtraItemCatalog" eic WHERE eic."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ExtraShoppingItem" esi WHERE esi."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ShoppingStore" store WHERE store."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ShoppingPackage" sp WHERE sp."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "FreezerItem" fi WHERE fi."householdId" = h."id")
    )
);

UPDATE "ExtraItemCatalog"
SET "householdId" = (
  SELECT "id"
  FROM "Household"
  WHERE "name" = 'Osberg Ottemo'
  ORDER BY "createdAt" ASC
  LIMIT 1
)
WHERE "householdId" IN (
  SELECT h."id"
  FROM "Household" h
  WHERE h."name" <> 'Osberg Ottemo'
    AND NOT EXISTS (
      SELECT 1
      FROM "HouseholdMember" hm
      WHERE hm."householdId" = h."id"
    )
    AND (
      EXISTS (SELECT 1 FROM "WeekPlan" wp WHERE wp."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "WeekIndex" wi WHERE wi."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ShoppingState" ss WHERE ss."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ExtraItemCatalog" eic WHERE eic."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ExtraShoppingItem" esi WHERE esi."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ShoppingStore" store WHERE store."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ShoppingPackage" sp WHERE sp."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "FreezerItem" fi WHERE fi."householdId" = h."id")
    )
);

UPDATE "ExtraShoppingItem"
SET "householdId" = (
  SELECT "id"
  FROM "Household"
  WHERE "name" = 'Osberg Ottemo'
  ORDER BY "createdAt" ASC
  LIMIT 1
)
WHERE "householdId" IN (
  SELECT h."id"
  FROM "Household" h
  WHERE h."name" <> 'Osberg Ottemo'
    AND NOT EXISTS (
      SELECT 1
      FROM "HouseholdMember" hm
      WHERE hm."householdId" = h."id"
    )
    AND (
      EXISTS (SELECT 1 FROM "WeekPlan" wp WHERE wp."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "WeekIndex" wi WHERE wi."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ShoppingState" ss WHERE ss."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ExtraItemCatalog" eic WHERE eic."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ExtraShoppingItem" esi WHERE esi."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ShoppingStore" store WHERE store."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ShoppingPackage" sp WHERE sp."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "FreezerItem" fi WHERE fi."householdId" = h."id")
    )
);

UPDATE "ShoppingStore" source
SET "householdId" = (
  SELECT "id"
  FROM "Household"
  WHERE "name" = 'Osberg Ottemo'
  ORDER BY "createdAt" ASC
  LIMIT 1
)
WHERE source."householdId" IN (
  SELECT h."id"
  FROM "Household" h
  WHERE h."name" <> 'Osberg Ottemo'
    AND NOT EXISTS (
      SELECT 1
      FROM "HouseholdMember" hm
      WHERE hm."householdId" = h."id"
    )
    AND (
      EXISTS (SELECT 1 FROM "WeekPlan" wp WHERE wp."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "WeekIndex" wi WHERE wi."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ShoppingState" ss WHERE ss."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ExtraItemCatalog" eic WHERE eic."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ExtraShoppingItem" esi WHERE esi."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ShoppingStore" store WHERE store."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ShoppingPackage" sp WHERE sp."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "FreezerItem" fi WHERE fi."householdId" = h."id")
    )
)
AND NOT EXISTS (
  SELECT 1
  FROM "ShoppingStore" existing
  WHERE existing."householdId" = (
    SELECT "id"
    FROM "Household"
    WHERE "name" = 'Osberg Ottemo'
    ORDER BY "createdAt" ASC
    LIMIT 1
  )
    AND existing."name" = source."name"
);

DELETE FROM "ShoppingStore" source
WHERE source."householdId" IN (
  SELECT h."id"
  FROM "Household" h
  WHERE h."name" <> 'Osberg Ottemo'
    AND NOT EXISTS (
      SELECT 1
      FROM "HouseholdMember" hm
      WHERE hm."householdId" = h."id"
    )
)
AND EXISTS (
  SELECT 1
  FROM "ShoppingStore" existing
  WHERE existing."householdId" = (
    SELECT "id"
    FROM "Household"
    WHERE "name" = 'Osberg Ottemo'
    ORDER BY "createdAt" ASC
    LIMIT 1
  )
    AND existing."name" = source."name"
);

UPDATE "ShoppingPackage"
SET "householdId" = (
  SELECT "id"
  FROM "Household"
  WHERE "name" = 'Osberg Ottemo'
  ORDER BY "createdAt" ASC
  LIMIT 1
)
WHERE "householdId" IN (
  SELECT h."id"
  FROM "Household" h
  WHERE h."name" <> 'Osberg Ottemo'
    AND NOT EXISTS (
      SELECT 1
      FROM "HouseholdMember" hm
      WHERE hm."householdId" = h."id"
    )
    AND (
      EXISTS (SELECT 1 FROM "WeekPlan" wp WHERE wp."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "WeekIndex" wi WHERE wi."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ShoppingState" ss WHERE ss."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ExtraItemCatalog" eic WHERE eic."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ExtraShoppingItem" esi WHERE esi."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ShoppingStore" store WHERE store."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ShoppingPackage" sp WHERE sp."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "FreezerItem" fi WHERE fi."householdId" = h."id")
    )
);

UPDATE "FreezerItem"
SET "householdId" = (
  SELECT "id"
  FROM "Household"
  WHERE "name" = 'Osberg Ottemo'
  ORDER BY "createdAt" ASC
  LIMIT 1
)
WHERE "householdId" IN (
  SELECT h."id"
  FROM "Household" h
  WHERE h."name" <> 'Osberg Ottemo'
    AND NOT EXISTS (
      SELECT 1
      FROM "HouseholdMember" hm
      WHERE hm."householdId" = h."id"
    )
    AND (
      EXISTS (SELECT 1 FROM "WeekPlan" wp WHERE wp."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "WeekIndex" wi WHERE wi."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ShoppingState" ss WHERE ss."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ExtraItemCatalog" eic WHERE eic."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ExtraShoppingItem" esi WHERE esi."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ShoppingStore" store WHERE store."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "ShoppingPackage" sp WHERE sp."householdId" = h."id")
      OR EXISTS (SELECT 1 FROM "FreezerItem" fi WHERE fi."householdId" = h."id")
    )
);

INSERT INTO "HouseholdMember" (
  "id",
  "householdId",
  "userId",
  "role",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  household."id",
  usr."id",
  'OWNER',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Household" household
CROSS JOIN "User" usr
WHERE household."name" = 'Osberg Ottemo'
  AND usr."email" = 'bootstrap-owner@example.invalid'
ON CONFLICT ("householdId", "userId") DO UPDATE
SET "role" = 'OWNER',
    "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "HouseholdMember" (
  "id",
  "householdId",
  "userId",
  "role",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  household."id",
  usr."id",
  'MEMBER',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Household" household
CROSS JOIN "User" usr
WHERE household."name" = 'Osberg Ottemo'
  AND usr."email" = 'bootstrap-member@example.invalid'
ON CONFLICT ("householdId", "userId") DO NOTHING;

UPDATE "ShoppingStore"
SET "isDefault" = true,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = (
  SELECT store."id"
  FROM "ShoppingStore" store
  WHERE store."householdId" = (
    SELECT "id"
    FROM "Household"
    WHERE "name" = 'Osberg Ottemo'
    ORDER BY "createdAt" ASC
    LIMIT 1
  )
  ORDER BY store."isDefault" DESC, store."createdAt" ASC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1
  FROM "ShoppingStore" store
  WHERE store."householdId" = (
    SELECT "id"
    FROM "Household"
    WHERE "name" = 'Osberg Ottemo'
    ORDER BY "createdAt" ASC
    LIMIT 1
  )
    AND store."isDefault" = true
);

INSERT INTO "ShoppingStore" (
  "id",
  "name",
  "categoryOrder",
  "isDefault",
  "householdId",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  'Standard butikk',
  ARRAY[
    'FRUKT_OG_GRONT',
    'KJOTT',
    'OST',
    'BROD',
    'MEIERI_OG_EGG',
    'HERMETIKK',
    'TORRVARER',
    'BAKEVARER',
    'HUSHOLDNING',
    'ANNET'
  ]::"IngredientCategory"[],
  true,
  household."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Household" household
WHERE household."name" = 'Osberg Ottemo'
  AND NOT EXISTS (
    SELECT 1
    FROM "ShoppingStore" store
    WHERE store."householdId" = household."id"
  );

DELETE FROM "Household" h
WHERE h."name" <> 'Osberg Ottemo'
  AND NOT EXISTS (
    SELECT 1
    FROM "HouseholdMember" hm
    WHERE hm."householdId" = h."id"
  )
  AND NOT EXISTS (SELECT 1 FROM "WeekPlan" wp WHERE wp."householdId" = h."id")
  AND NOT EXISTS (SELECT 1 FROM "WeekIndex" wi WHERE wi."householdId" = h."id")
  AND NOT EXISTS (SELECT 1 FROM "ShoppingState" ss WHERE ss."householdId" = h."id")
  AND NOT EXISTS (SELECT 1 FROM "ExtraItemCatalog" eic WHERE eic."householdId" = h."id")
  AND NOT EXISTS (SELECT 1 FROM "ExtraShoppingItem" esi WHERE esi."householdId" = h."id")
  AND NOT EXISTS (SELECT 1 FROM "ShoppingStore" store WHERE store."householdId" = h."id")
  AND NOT EXISTS (SELECT 1 FROM "ShoppingPackage" sp WHERE sp."householdId" = h."id")
  AND NOT EXISTS (SELECT 1 FROM "FreezerItem" fi WHERE fi."householdId" = h."id");
