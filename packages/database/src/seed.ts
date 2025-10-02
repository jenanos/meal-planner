import { Prisma, prisma } from "./client";

type Cat = "FISK" | "VEGETAR" | "KYLLING" | "STORFE" | "ANNET";

const INGREDIENTS = [
  { name: "løk", unit: "stk" },
  { name: "tomat", unit: "stk" },
  { name: "bønner", unit: "g" },
  { name: "ris", unit: "g" },
  { name: "tortillalefser", unit: "stk" },
  { name: "torsk", unit: "g" },
  { name: "poteter", unit: "g" },
  { name: "kylling", unit: "g" },
  { name: "storfekjøtt", unit: "g" },
  { name: "hvitløk", unit: "fedd" },
  { name: "paprika", unit: "stk" },
] as const;

type IngredientUsage = { name: string; quantity?: string | number; notes?: string };

type RecipeSeed = {
  name: string;
  category: Cat;
  everydayScore: number; // 1–5
  healthScore: number;   // 1–5
  description?: string;
  usageCount?: number;
  lastUsedDaysAgo?: number | null; // null = aldri brukt
  ingredients: IngredientUsage[];
};

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

const RECIPES: RecipeSeed[] = [
  // VEGETAR (≥4)
  {
    name: "Grønnsakscurry",
    category: "VEGETAR",
    everydayScore: 2,
    healthScore: 5,
    usageCount: 5,
    lastUsedDaysAgo: 30,
    ingredients: [
      { name: "løk", quantity: 1 },
      { name: "tomat", quantity: 2 },
      { name: "bønner", quantity: 200 },
      { name: "ris", quantity: 200 },
      { name: "hvitløk", quantity: 2 },
    ],
  },
  {
    name: "Veggie tacos",
    category: "VEGETAR",
    everydayScore: 3,
    healthScore: 4,
    usageCount: 4,
    lastUsedDaysAgo: 15,
    ingredients: [
      { name: "tortillalefser", quantity: 8 },
      { name: "bønner", quantity: 250 },
      { name: "løk", quantity: 1 },
      { name: "paprika", quantity: 1 },
      { name: "tomat", quantity: 2 },
    ],
  },
  {
    name: "Linsegryte",
    category: "VEGETAR",
    everydayScore: 2,
    healthScore: 5,
    usageCount: 3,
    lastUsedDaysAgo: 45,
    ingredients: [
      { name: "løk", quantity: 1 },
      { name: "tomat", quantity: 3 },
      { name: "bønner", quantity: 200, notes: "linser el. bønner" },
      { name: "hvitløk", quantity: 2 },
    ],
  },
  {
    name: "Ovnsbakt grønnsaksform",
    category: "VEGETAR",
    everydayScore: 2,
    healthScore: 4,
    usageCount: 2,
    lastUsedDaysAgo: 70,
    ingredients: [
      { name: "poteter", quantity: 500 },
      { name: "paprika", quantity: 1 },
      { name: "løk", quantity: 1 },
      { name: "tomat", quantity: 2 },
    ],
  },

  // FISK (≥4)
  {
    name: "Torsk i form",
    category: "FISK",
    everydayScore: 2,
    healthScore: 5,
    usageCount: 6,
    lastUsedDaysAgo: 10,
    ingredients: [
      { name: "torsk", quantity: 400 },
      { name: "poteter", quantity: 600 },
      { name: "løk", quantity: 1 },
    ],
  },
  {
    name: "Laks og ris",
    category: "FISK",
    everydayScore: 2,
    healthScore: 4,
    usageCount: 2,
    lastUsedDaysAgo: 90,
    ingredients: [
      { name: "torsk", quantity: 400, notes: "evt. laks" },
      { name: "ris", quantity: 200 },
      { name: "paprika", quantity: 1 },
    ],
  },
  {
    name: "Fiskekaker i pita",
    category: "FISK",
    everydayScore: 3,
    healthScore: 3,
    usageCount: 4,
    lastUsedDaysAgo: 25,
    ingredients: [
      { name: "tortillalefser", quantity: 6 },
      { name: "løk", quantity: 1 },
      { name: "tomat", quantity: 2 },
    ],
  },
  {
    name: "Torsk med tomatsaus",
    category: "FISK",
    everydayScore: 3,
    healthScore: 4,
    usageCount: 1,
    lastUsedDaysAgo: 60,
    ingredients: [
      { name: "torsk", quantity: 400 },
      { name: "tomat", quantity: 3 },
      { name: "hvitløk", quantity: 2 },
      { name: "løk", quantity: 1 },
    ],
  },

  // KYLLING (≥3)
  {
    name: "Kylling fajitas",
    category: "KYLLING",
    everydayScore: 4,
    healthScore: 3,
    usageCount: 7,
    lastUsedDaysAgo: 12,
    ingredients: [
      { name: "kylling", quantity: 400 },
      { name: "tortillalefser", quantity: 8 },
      { name: "paprika", quantity: 2 },
      { name: "løk", quantity: 1 },
    ],
  },
  {
    name: "Kylling og ris",
    category: "KYLLING",
    everydayScore: 3,
    healthScore: 4,
    usageCount: 1,
    lastUsedDaysAgo: 50,
    ingredients: [
      { name: "kylling", quantity: 400 },
      { name: "ris", quantity: 200 },
      { name: "løk", quantity: 1 },
    ],
  },
  {
    name: "Kyllinggryte",
    category: "KYLLING",
    everydayScore: 3,
    healthScore: 4,
    usageCount: 0,
    lastUsedDaysAgo: null,
    ingredients: [
      { name: "kylling", quantity: 500 },
      { name: "paprika", quantity: 1 },
      { name: "løk", quantity: 1 },
      { name: "tomat", quantity: 2 },
    ],
  },

  // STORFE (≥3)
  {
    name: "Spaghetti Bolognese",
    category: "STORFE",
    everydayScore: 4,
    healthScore: 3,
    usageCount: 10,
    lastUsedDaysAgo: 5,
    ingredients: [
      { name: "storfekjøtt", quantity: 400 },
      { name: "tomat", quantity: 3 },
      { name: "løk", quantity: 1 },
      { name: "hvitløk", quantity: 2 },
    ],
  },
  {
    name: "Kjøttkaker",
    category: "STORFE",
    everydayScore: 4,
    healthScore: 3,
    usageCount: 8,
    lastUsedDaysAgo: 40,
    ingredients: [
      { name: "storfekjøtt", quantity: 500 },
      { name: "poteter", quantity: 600 },
      { name: "løk", quantity: 1 },
    ],
  },
  {
    name: "Taco (helg)",
    category: "STORFE",
    everydayScore: 5,
    healthScore: 3,
    usageCount: 9,
    lastUsedDaysAgo: 20,
    ingredients: [
      { name: "storfekjøtt", quantity: 400 },
      { name: "tortillalefser", quantity: 8 },
      { name: "løk", quantity: 1 },
      { name: "tomat", quantity: 2 },
    ],
  },

  // ANNET (helg)
  {
    name: "Pizza (helg)",
    category: "ANNET",
    everydayScore: 5,
    healthScore: 4,
    usageCount: 6,
    lastUsedDaysAgo: 18,
    ingredients: [
      { name: "tomat", quantity: 3, notes: "saus" },
      { name: "løk", quantity: 1 },
      { name: "paprika", quantity: 1 },
    ],
  },

  // Flere vegetar/fisk for kvoter
  {
    name: "Tomatsuppe",
    category: "VEGETAR",
    everydayScore: 1,
    healthScore: 5,
    usageCount: 2,
    lastUsedDaysAgo: 35,
    ingredients: [
      { name: "tomat", quantity: 4 },
      { name: "løk", quantity: 1 },
      { name: "hvitløk", quantity: 1 },
    ],
  },
  {
    name: "Bønnegryte",
    category: "VEGETAR",
    everydayScore: 2,
    healthScore: 5,
    usageCount: 1,
    lastUsedDaysAgo: 80,
    ingredients: [
      { name: "bønner", quantity: 300 },
      { name: "løk", quantity: 1 },
      { name: "tomat", quantity: 2 },
    ],
  },
  {
    name: "Fisk og potetmos",
    category: "FISK",
    everydayScore: 3,
    healthScore: 4,
    usageCount: 1,
    lastUsedDaysAgo: 55,
    ingredients: [
      { name: "torsk", quantity: 400 },
      { name: "poteter", quantity: 600 },
      { name: "løk", quantity: 1 },
    ],
  },
];

async function main() {
  // Upsert ingredienser
  for (const ing of INGREDIENTS) {
    const trimmedName = ing.name.trim();
    await prisma.ingredient.upsert({
      where: { name: trimmedName },
      update: { unit: ing.unit ?? null },
      create: { name: trimmedName, unit: ing.unit ?? null },
    });
  }

  // Seed some extra shopping catalog items (non-recipe)
  const EXTRAS = [
    "vaskemiddel",
    "toalettpapir",
    "tannkrem",
    "oppvaskmiddel",
    "sjampo",
    "aluminiumsfolie",
    "plastposer",
  ];
  for (const name of EXTRAS) {
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
