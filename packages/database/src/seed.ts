import { Prisma, prisma } from "./client";
import { EXTRA_CATALOG, INGREDIENTS, RECIPES } from "./seed-data";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function main() {
  // Upsert ingredienser
  for (const ing of INGREDIENTS) {
    const trimmedName = ing.name.trim();
    await prisma.ingredient.upsert({
      where: { name: trimmedName },
      update: {
        unit: ing.unit ?? null,
        isPantryItem: Boolean(ing.isPantryItem),
      },
      create: {
        name: trimmedName,
        unit: ing.unit ?? null,
        isPantryItem: Boolean(ing.isPantryItem),
      },
    });
  }

  // Seed some extra shopping catalog items (non-recipe)
  for (const name of EXTRA_CATALOG) {
    const trimmed = name.trim();
    await prisma.extraItemCatalog.upsert({
      where: { name: trimmed },
      update: {},
      create: { name: trimmed },
    });
  }

  for (const r of RECIPES) {
    const trimmedName = r.name.trim();
    // Upsert oppskrift på navn (idempotent)
    const recipe = await prisma.recipe.upsert({
      where: { name: trimmedName },
      update: {
        category: r.category,
        description: r.description?.trim() ?? null,
        everydayScore: r.everydayScore,
        healthScore: r.healthScore,
        usageCount: r.usageCount ?? 0,
        lastUsed:
          r.lastUsedDaysAgo == null ? null : daysAgo(r.lastUsedDaysAgo),
      },
      create: {
        name: trimmedName,
        category: r.category,
        description: r.description?.trim() ?? null,
        everydayScore: r.everydayScore,
        healthScore: r.healthScore,
        usageCount: r.usageCount ?? 0,
        lastUsed:
          r.lastUsedDaysAgo == null ? null : daysAgo(r.lastUsedDaysAgo),
      },
    });

    // Koble ingredienser (fjern eksisterende koblinger og lag på nytt)
    await prisma.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });
    for (const iu of r.ingredients) {
      const ing = await prisma.ingredient.findUnique({ where: { name: iu.name.trim() } });
      if (!ing) continue;
      await prisma.recipeIngredient.create({
        data: {
          recipeId: recipe.id,
          ingredientId: ing.id,
          quantity: iu.quantity == null ? null : new Prisma.Decimal(String(iu.quantity)),
          notes: iu.notes?.trim() ?? null,
        },
      });
    }
  }

  console.log("Seeding complete");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
