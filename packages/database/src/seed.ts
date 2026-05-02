import { Prisma, prisma } from "./client.js";
import { ensureBootstrapState, getBootstrapConfigFromEnv } from "./bootstrap.js";
import { importProdDump } from "./prod-dump-import.js";
import { EXTRA_CATALOG, INGREDIENTS, RECIPES } from "./seed-data.js";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function seedBootstrapFromEnv() {
  const config = getBootstrapConfigFromEnv();
  const { householdId } = await ensureBootstrapState();

  if (!config.allowlistedEmails.length && !householdId) {
    console.log(
      "No bootstrap auth env configured. Skipping allowlist/household bootstrap.",
    );
    return;
  }

  console.log("Bootstrap auth configuration applied from env.");
  if (config.allowlistedEmails.length) {
    console.log(`  Allowlist: ${config.allowlistedEmails.join(", ")}`);
  }
  if (householdId && config.householdName) {
    console.log(`  Household: ${config.householdName}`);
  }
}

async function main() {
  const prodDumpPath = process.env.PROD_DB_DUMP_PATH?.trim();
  if (prodDumpPath) {
    console.log(`PROD_DB_DUMP_PATH er satt. Importerer prod-dump fra ${prodDumpPath}`);
    await importProdDump(prodDumpPath);
    return;
  }

  await seedBootstrapFromEnv();

  // Upsert ingredienser
  for (const ing of INGREDIENTS) {
    const trimmedName = ing.name.trim();
    await prisma.ingredient.upsert({
      where: { name: trimmedName },
      update: {
        unit: ing.unit ?? null,
        isPantryItem: Boolean(ing.isPantryItem),
        ...(ing.category ? { category: ing.category } : {}),
      },
      create: {
        name: trimmedName,
        unit: ing.unit ?? null,
        isPantryItem: Boolean(ing.isPantryItem),
        ...(ing.category ? { category: ing.category } : {}),
      },
    });
  }

  // The extra catalog items are now household-scoped.
  // In dev mode, seed them into all dev households.
  const households = await prisma.household.findMany({ select: { id: true } });
  for (const name of EXTRA_CATALOG) {
    const trimmed = name.trim();
    for (const h of households) {
      await prisma.extraItemCatalog.upsert({
        where: { name_householdId: { name: trimmed, householdId: h.id } },
        update: {},
        create: { name: trimmed, householdId: h.id },
      });
    }
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
