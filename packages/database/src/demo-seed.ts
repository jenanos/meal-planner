import { Prisma, type PrismaClient } from "@prisma/client";
import { EXTRA_CATALOG, INGREDIENTS, RECIPES } from "./seed-data.js";
import { DEMO_HOUSEHOLD_NAME, DEMO_USER } from "./demo.js";

function startOfWeekUTC(base: Date) {
  const utc = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()),
  );
  const day = utc.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  utc.setUTCDate(utc.getUTCDate() + diff);
  utc.setUTCHours(0, 0, 0, 0);
  return utc;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

type DemoDayEntry =
  | { type: "RECIPE"; recipe: string }
  | { type: "TAKEAWAY" }
  | { type: "FREEZER"; recipe: string }
  | { type: "EMPTY" };

/** Weekly menus seeded relative to the current week (offset in weeks). */
const DEMO_WEEKS: Array<{ offset: number; days: DemoDayEntry[] }> = [
  {
    offset: -2,
    days: [
      { type: "RECIPE", recipe: "Torsk i form" },
      { type: "RECIPE", recipe: "Grønnsakscurry" },
      { type: "RECIPE", recipe: "Kylling og ris" },
      { type: "RECIPE", recipe: "Kjøttkaker" },
      { type: "RECIPE", recipe: "Tomatsuppe" },
      { type: "RECIPE", recipe: "Pizza (helg)" },
      { type: "RECIPE", recipe: "Spaghetti Bolognese" },
    ],
  },
  {
    offset: -1,
    days: [
      { type: "RECIPE", recipe: "Veggie tacos" },
      { type: "RECIPE", recipe: "Fisk og potetmos" },
      { type: "RECIPE", recipe: "Kylling fajitas" },
      { type: "RECIPE", recipe: "Linsegryte" },
      { type: "RECIPE", recipe: "Torsk med tomatsaus" },
      { type: "TAKEAWAY" },
      { type: "RECIPE", recipe: "Taco (helg)" },
    ],
  },
  {
    offset: 0,
    days: [
      { type: "RECIPE", recipe: "Kyllinggryte" },
      { type: "RECIPE", recipe: "Bønnegryte" },
      { type: "RECIPE", recipe: "Fiskekaker i pita" },
      { type: "FREEZER", recipe: "Spaghetti Bolognese" },
      { type: "RECIPE", recipe: "Ovnsbakt grønnsaksform" },
      { type: "TAKEAWAY" },
      { type: "RECIPE", recipe: "Taco (helg)" },
    ],
  },
];

/**
 * Seeds a self-contained, realistic dataset for demo mode: one household,
 * one demo user, the shared recipe/ingredient catalog, three planned weeks
 * (two historic + the current one), freezer inventory, and a few extra
 * shopping items.
 *
 * Returns the demo household id (used as tRPC context for all visitors).
 */
export async function seedDemoData(prisma: PrismaClient): Promise<string> {
  const user = await prisma.user.create({
    data: {
      id: DEMO_USER.id,
      name: DEMO_USER.name,
      email: DEMO_USER.email,
      emailVerified: true,
      role: DEMO_USER.role,
    },
  });

  const household = await prisma.household.create({
    data: { name: DEMO_HOUSEHOLD_NAME },
  });

  await prisma.householdMember.create({
    data: { householdId: household.id, userId: user.id, role: "OWNER" },
  });

  await prisma.allowedEmail.create({
    data: { email: DEMO_USER.email, addedBy: user.id },
  });

  const ingredientIds = new Map<string, string>();
  for (const ing of INGREDIENTS) {
    const created = await prisma.ingredient.create({
      data: {
        name: ing.name.trim(),
        unit: ing.unit ?? null,
        isPantryItem: Boolean(ing.isPantryItem),
        ...(ing.category ? { category: ing.category } : {}),
      },
    });
    ingredientIds.set(created.name, created.id);
  }

  const recipeIds = new Map<string, string>();
  for (const r of RECIPES) {
    const recipe = await prisma.recipe.create({
      data: {
        name: r.name.trim(),
        category: r.category,
        description: r.description?.trim() ?? null,
        everydayScore: r.everydayScore,
        healthScore: r.healthScore,
        usageCount: r.usageCount ?? 0,
        lastUsed: r.lastUsedDaysAgo == null ? null : daysAgo(r.lastUsedDaysAgo),
        ingredients: {
          create: r.ingredients.flatMap((usage) => {
            const ingredientId = ingredientIds.get(usage.name.trim());
            if (!ingredientId) return [];
            return [
              {
                ingredientId,
                quantity:
                  usage.quantity == null
                    ? null
                    : new Prisma.Decimal(String(usage.quantity)),
                notes: usage.notes?.trim() ?? null,
              },
            ];
          }),
        },
      },
    });
    recipeIds.set(recipe.name, recipe.id);
  }

  const catalogIds = new Map<string, string>();
  for (const name of EXTRA_CATALOG) {
    const item = await prisma.extraItemCatalog.create({
      data: { name: name.trim(), householdId: household.id },
    });
    catalogIds.set(item.name, item.id);
  }

  const currentWeekStart = startOfWeekUTC(new Date());
  for (const week of DEMO_WEEKS) {
    const weekStart = addDays(currentWeekStart, week.offset * 7);
    const weekIndex = await prisma.weekIndex.create({
      data: { weekStart, householdId: household.id },
    });
    const plan = await prisma.weekPlan.create({
      data: {
        weekStart,
        householdId: household.id,
        weekIndexId: weekIndex.id,
      },
    });
    for (let dayIndex = 0; dayIndex < week.days.length; dayIndex++) {
      const day = week.days[dayIndex];
      if (day.type === "EMPTY") continue;
      const recipeId =
        day.type === "TAKEAWAY" ? null : (recipeIds.get(day.recipe) ?? null);
      if (day.type !== "TAKEAWAY" && !recipeId) continue;
      await prisma.weekPlanEntry.create({
        data: {
          weekPlanId: plan.id,
          dayIndex,
          recipeId,
          entryType: day.type,
        },
      });
    }
  }

  const freezerItems: Array<{ recipe: string; quantity: number }> = [
    { recipe: "Spaghetti Bolognese", quantity: 2 },
    { recipe: "Tomatsuppe", quantity: 1 },
  ];
  for (const item of freezerItems) {
    const recipeId = recipeIds.get(item.recipe);
    if (!recipeId) continue;
    await prisma.freezerItem.create({
      data: {
        recipeId,
        householdId: household.id,
        quantity: item.quantity,
        frozenAt: daysAgo(14),
        expiresAt: addDays(new Date(), 76),
      },
    });
  }

  const extras: Array<{ name: string; checked: boolean }> = [
    { name: "toalettpapir", checked: false },
    { name: "oppvaskmiddel", checked: true },
  ];
  for (const extra of extras) {
    const catalogItemId = catalogIds.get(extra.name);
    if (!catalogItemId) continue;
    await prisma.extraShoppingItem.create({
      data: {
        weekStart: currentWeekStart,
        catalogItemId,
        checked: extra.checked,
        householdId: household.id,
      },
    });
  }

  return household.id;
}
