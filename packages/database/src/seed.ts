import { prisma } from "./client";

type Diet = "MEAT" | "FISH" | "VEG";
const diets: Diet[] = ["MEAT", "FISH", "VEG"];
const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

function startOfWeekMonday(date = new Date()) {
  const d = new Date(date.getTime());
  const day = d.getDay(); // 0=Sun,1=Mon,...6=Sat
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function main() {
  const householdId = "00000000-0000-0000-0000-000000000001";

  await prisma.household.upsert({
    where: { id: householdId },
    update: {},
    create: { id: householdId, name: "Default household" },
  });

  const recipeSeed: Array<{ householdId: string; title: string; diet: Diet }> = [
    { householdId, title: "Spaghetti Bolognese", diet: "MEAT" },
    { householdId, title: "Kylling fajitas", diet: "MEAT" },
    { householdId, title: "Kjøttkaker", diet: "MEAT" },
    { householdId, title: "Laks i ovn", diet: "FISH" },
    { householdId, title: "Torsk med potetmos", diet: "FISH" },
    { householdId, title: "Fiskekaker", diet: "FISH" },
    { householdId, title: "Grønnsakscurry", diet: "VEG" },
    { householdId, title: "Veggie tacos", diet: "VEG" },
    { householdId, title: "Linsegryte", diet: "VEG" },
  ];

  // create-if-not-exists (unngår duplikater uten skipDuplicates)
  for (const r of recipeSeed) {
    const exists = await prisma.recipe.findFirst({
      where: { householdId: r.householdId, title: r.title, diet: r.diet },
    });
    if (!exists) {
      await prisma.recipe.create({ data: r });
    }
  }

  const allRecipes = await prisma.recipe.findMany({
    where: { householdId },
    orderBy: { title: "asc" },
  });

  const byDiet = new Map<Diet, typeof allRecipes>();
  diets.forEach((d) => byDiet.set(d, allRecipes.filter((r) => r.diet === d)));

  const weekStart = startOfWeekMonday();

  const existing = await prisma.mealPlan.findFirst({
    where: { householdId, weekStart },
  });

  if (!existing) {
    const pattern: Diet[] = ["MEAT", "FISH", "VEG", "MEAT", "FISH", "VEG", "MEAT"];
    const items = days.map((day, i) => {
      const list = byDiet.get(pattern[i]) ?? [];
      const recipeId = list.length ? list[i % list.length].id : null;
      return { day, recipeId };
    });

    await prisma.mealPlan.create({
      data: {
        householdId,
        weekStart,
        items: { create: items },
      },
    });
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
