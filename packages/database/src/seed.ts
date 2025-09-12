import { prisma } from "./client";

const householdId = "00000000-0000-0000-0000-000000000001";

async function main() {
  await prisma.household.upsert({
    where: { id: householdId },
    update: {},
    create: {
      id: householdId,
      name: "Familien",
    },
  });

  const recipes = [
    { title: "Biff", diet: "MEAT" },
    { title: "Kylling", diet: "MEAT" },
    { title: "Lam", diet: "MEAT" },
    { title: "Laks", diet: "FISH" },
    { title: "Torsk", diet: "FISH" },
    { title: "Makrell", diet: "FISH" },
    { title: "Salat", diet: "VEG" },
    { title: "Pasta", diet: "VEG" },
    { title: "Grønnsakssuppe", diet: "VEG" },
  ];

  await Promise.all(
    recipes.map((r) =>
      prisma.recipe.create({
        data: { ...r, householdId },
      })
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
