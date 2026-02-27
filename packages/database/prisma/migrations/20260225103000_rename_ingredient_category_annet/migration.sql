-- Rename oppsamlingskategori from UKATEGORISERT to ANNET
ALTER TYPE "IngredientCategory" RENAME VALUE 'UKATEGORISERT' TO 'ANNET';

-- Keep new ingredients in oppsamlingskategorien by default
ALTER TABLE "Ingredient"
ALTER COLUMN "category" SET DEFAULT 'ANNET';
