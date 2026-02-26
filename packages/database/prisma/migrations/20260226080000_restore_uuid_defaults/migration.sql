-- Restore gen_random_uuid() defaults on UUID id columns that were
-- accidentally dropped in the 20251004173608_errorfix migration.

ALTER TABLE "Recipe" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "Ingredient" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "WeekPlan" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "WeekIndex" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "WeekPlanEntry" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "ShoppingState" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "ExtraItemCatalog" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "ExtraShoppingItem" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
