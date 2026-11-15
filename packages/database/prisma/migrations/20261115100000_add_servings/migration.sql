-- How many portions a recipe's quantities are written for, and how many the
-- household cooks for. When both are known, the shopping list scales the
-- recipe's quantities by the ratio; otherwise quantities are used as written.
ALTER TABLE "Recipe" ADD COLUMN "servings" INTEGER;
ALTER TABLE "Household" ADD COLUMN "servings" INTEGER;
