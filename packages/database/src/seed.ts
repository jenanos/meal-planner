import { Prisma, prisma } from "./client";
import { EXTRA_CATALOG, INGREDIENTS, RECIPES } from "./seed-data";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

const STANDARD_STORE_CATEGORY_ORDER = [
  "FRUKT_OG_GRONT",
  "KJOTT",
  "OST",
  "BROD",
  "MEIERI_OG_EGG",
  "HERMETIKK",
  "TORRVARER",
  "BAKEVARER",
  "HUSHOLDNING",
  "ANNET",
] as const;

// ─── Dev seed users ───
// Two households with predefined users for local development.
const DEV_HOUSEHOLDS = [
  {
    name: "Husholdning 1",
    members: [
      { email: "jens@hus1-dev.no", name: "Jens", role: "ADMIN" as const },
      { email: "neo@hus1-dev.no", name: "Neo", role: "USER" as const },
    ],
  },
  {
    name: "Husholdning 2",
    members: [
      { email: "panam@hus2-dev.no", name: "Panam", role: "USER" as const },
      { email: "v@hus2-dev.no", name: "V", role: "USER" as const },
    ],
  },
];

/** Seed the admin user from ADMIN_EMAIL env var (for production). */
async function seedAdminFromEnv() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  if (!adminEmail) return;

  console.log(`Seeding admin from ADMIN_EMAIL: ${adminEmail}`);

  // Ensure the admin email is in the allowlist
  await prisma.allowedEmail.upsert({
    where: { email: adminEmail.toLowerCase() },
    update: {},
    create: { email: adminEmail.toLowerCase() },
  });

  // If the user already exists, promote to ADMIN
  const existing = await prisma.user.findUnique({
    where: { email: adminEmail.toLowerCase() },
  });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: "ADMIN" },
    });
    console.log(`  Promoted existing user ${adminEmail} to ADMIN`);
  } else {
    console.log(`  Admin email ${adminEmail} added to allowlist. User will be created on first login.`);
  }
}

/** Seed dev users and households (only in development). */
async function seedDevUsers() {
  if (process.env.NODE_ENV === "production") {
    console.log("Skipping dev user seed in production.");
    return;
  }

  console.log("Seeding dev users and households…");

  for (const household of DEV_HOUSEHOLDS) {
    // Ensure all member emails are in the allowlist
    for (const member of household.members) {
      await prisma.allowedEmail.upsert({
        where: { email: member.email.toLowerCase() },
        update: {},
        create: { email: member.email.toLowerCase() },
      });
    }

    // Upsert users (better-auth uses string IDs; we use email-based deterministic IDs for dev)
    const userIds: string[] = [];
    for (const member of household.members) {
      const userId = `dev-${member.email.replace(/[@.]/g, "-")}`;
      await prisma.user.upsert({
        where: { email: member.email.toLowerCase() },
        update: { name: member.name, role: member.role },
        create: {
          id: userId,
          email: member.email.toLowerCase(),
          name: member.name,
          emailVerified: true,
          role: member.role,
        },
      });
      userIds.push(userId);
    }

    // Check if these users already share a household
    const existingMembership = await prisma.householdMember.findFirst({
      where: { userId: userIds[0] },
      select: { householdId: true },
    });

    let householdId: string;
    if (existingMembership) {
      householdId = existingMembership.householdId;
      // Ensure name is up to date
      await prisma.household.update({
        where: { id: householdId },
        data: { name: household.name },
      });
    } else {
      const h = await prisma.household.create({
        data: { name: household.name },
      });
      householdId = h.id;
    }

    // Ensure all members are in the household
    for (let i = 0; i < household.members.length; i++) {
      const userId = userIds[i];
      await prisma.householdMember.upsert({
        where: {
          householdId_userId: { householdId, userId },
        },
        update: { role: i === 0 ? "OWNER" : "MEMBER" },
        create: {
          householdId,
          userId,
          role: i === 0 ? "OWNER" : "MEMBER",
        },
      });
    }

    // Ensure household has a default shopping store
    const storeCount = await prisma.shoppingStore.count({
      where: { householdId },
    });
    if (storeCount === 0) {
      await prisma.shoppingStore.create({
        data: {
          name: "Standard butikk",
          isDefault: true,
          householdId,
          categoryOrder: [...STANDARD_STORE_CATEGORY_ORDER],
        },
      });
    }

    console.log(`  ${household.name}: ${household.members.map((m) => m.email).join(", ")}`);
  }
}

async function main() {
  // ── Seed allowed emails & users ──
  await seedAdminFromEnv();
  await seedDevUsers();

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
