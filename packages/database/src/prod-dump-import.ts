import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { prisma } from "./client";

const MIGRATED_HOUSEHOLD_NAME = "Migrert prod-husholdning";

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

const LEGACY_USERS = {
  JENS: {
    email: "jens@prod-import.local",
    name: "Jens",
    appRole: "ADMIN" as const,
    householdRole: "OWNER" as const,
  },
  INGVILD: {
    email: "ingvild@prod-import.local",
    name: "Ingvild",
    appRole: "USER" as const,
    householdRole: "MEMBER" as const,
  },
} as const;

type LegacyRole = keyof typeof LEGACY_USERS;

type CopyRow = Record<string, string | null>;

type ParsedProdDump = {
  recipes: CopyRow[];
  ingredients: CopyRow[];
  recipeIngredients: CopyRow[];
  weekIndices: CopyRow[];
  weekPlans: CopyRow[];
  weekPlanEntries: CopyRow[];
  shoppingStates: CopyRow[];
  extraItemCatalog: CopyRow[];
  extraShoppingItems: CopyRow[];
  shoppingStores: CopyRow[];
  shoppingPreferences: CopyRow[];
  devicePreferences: CopyRow[];
};

type ImportProdDumpOptions = {
  dryRun?: boolean;
};

type SeedUser = {
  email: string;
  name: string;
  appRole: "USER" | "ADMIN";
  householdRole: "OWNER" | "MEMBER";
  preferenceSourceRole: LegacyRole | null;
};

function normalizeColumnName(column: string) {
  return column.trim().replace(/^"|"$/g, "");
}

function parseCopyBlocks(sql: string) {
  const blocks = new Map<string, CopyRow[]>();
  const regex = /COPY public\."([^"]+)" \(([^)]+)\) FROM stdin;\n([\s\S]*?)\n\\\./g;

  for (const match of sql.matchAll(regex)) {
    const [, tableName, rawColumns, rawBody] = match;
    const columns = rawColumns.split(",").map(normalizeColumnName);
    const rows = rawBody
      .split("\n")
      .filter(Boolean)
      .map((line) => parseCopyLine(columns, line));
    blocks.set(tableName, rows);
  }

  return blocks;
}

function parseCopyLine(columns: string[], line: string): CopyRow {
  const values = line.split("\t");
  if (values.length !== columns.length) {
    throw new Error(
      `COPY row had ${values.length} values, expected ${columns.length}: ${line.slice(0, 120)}`,
    );
  }

  return Object.fromEntries(
    columns.map((column, index) => [column, decodeCopyValue(values[index] ?? "")]),
  );
}

function decodeCopyValue(value: string): string | null {
  if (value === "\\N") return null;

  let decoded = "";
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch !== "\\") {
      decoded += ch;
      continue;
    }

    i += 1;
    const next = value[i];
    if (next == null) {
      decoded += "\\";
      break;
    }

    if (/[0-7]/.test(next) && /[0-7]{2}/.test(value.slice(i + 1, i + 3))) {
      decoded += String.fromCharCode(
        Number.parseInt(`${next}${value.slice(i + 1, i + 3)}`, 8),
      );
      i += 2;
      continue;
    }

    decoded += (
      {
        b: "\b",
        f: "\f",
        n: "\n",
        r: "\r",
        t: "\t",
        v: "\v",
        "\\": "\\",
      } as const
    )[next] ?? next;
  }

  return decoded;
}

function requireTable(blocks: Map<string, CopyRow[]>, tableName: string) {
  const rows = blocks.get(tableName);
  if (!rows) {
    throw new Error(`Fant ikke forventet COPY-blokk for tabellen "${tableName}" i dumpen.`);
  }
  return rows;
}

function optionalTable(blocks: Map<string, CopyRow[]>, tableName: string) {
  return blocks.get(tableName) ?? [];
}

function parsePgBoolean(value: string | null) {
  if (value === "t") return true;
  if (value === "f") return false;
  throw new Error(`Ugyldig PostgreSQL-boolean: ${value}`);
}

function parsePgArray(value: string | null) {
  if (value == null || value === "{}") return [];
  if (!value.startsWith("{") || !value.endsWith("}")) {
    throw new Error(`Ugyldig PostgreSQL-array: ${value}`);
  }

  const inner = value.slice(1, -1);
  if (!inner) return [];

  const items: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === "\\" && i + 1 < inner.length) {
      current += inner[i + 1];
      i += 1;
      continue;
    }

    if (ch === "," && !inQuotes) {
      items.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  items.push(current);
  return items;
}

function parsePgIntArray(value: string | null) {
  return parsePgArray(value).map((item) => Number.parseInt(item, 10));
}

function parsePgTimestamp(value: string | null) {
  if (value == null) return null;
  return new Date(`${value.replace(" ", "T")}Z`);
}

function createUserId(email: string) {
  return `prod-seed-${createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 24)}`;
}

function parseProdDump(sql: string): ParsedProdDump {
  const blocks = parseCopyBlocks(sql);

  return {
    recipes: requireTable(blocks, "Recipe"),
    ingredients: requireTable(blocks, "Ingredient"),
    recipeIngredients: requireTable(blocks, "RecipeIngredient"),
    weekIndices: requireTable(blocks, "WeekIndex"),
    weekPlans: requireTable(blocks, "WeekPlan"),
    weekPlanEntries: requireTable(blocks, "WeekPlanEntry"),
    shoppingStates: requireTable(blocks, "ShoppingState"),
    extraItemCatalog: requireTable(blocks, "ExtraItemCatalog"),
    extraShoppingItems: requireTable(blocks, "ExtraShoppingItem"),
    shoppingStores: requireTable(blocks, "ShoppingStore"),
    shoppingPreferences: optionalTable(blocks, "ShoppingPreference"),
    devicePreferences: optionalTable(blocks, "DevicePreference"),
  };
}

function buildSeedUsers(adminEmail?: string | null): SeedUser[] {
  const users: SeedUser[] = [
    {
      ...LEGACY_USERS.JENS,
      preferenceSourceRole: "JENS",
    },
    {
      ...LEGACY_USERS.INGVILD,
      preferenceSourceRole: "INGVILD",
    },
  ];

  const normalizedAdminEmail = adminEmail?.trim().toLowerCase();
  if (!normalizedAdminEmail) return users;

  const alreadyPresent = users.some((user) => user.email === normalizedAdminEmail);
  if (alreadyPresent) return users;

  users.push({
    email: normalizedAdminEmail,
    name: normalizedAdminEmail.split("@")[0] || "Admin",
    appRole: "ADMIN",
    householdRole: "OWNER",
    preferenceSourceRole: "JENS",
  });

  return users;
}

function logSummary(parsed: ParsedProdDump) {
  console.log("Prod dump parsed:");
  console.log(`  Recipes: ${parsed.recipes.length}`);
  console.log(`  Ingredients: ${parsed.ingredients.length}`);
  console.log(`  Recipe ingredients: ${parsed.recipeIngredients.length}`);
  console.log(`  Week indices: ${parsed.weekIndices.length}`);
  console.log(`  Week plans: ${parsed.weekPlans.length}`);
  console.log(`  Week plan entries: ${parsed.weekPlanEntries.length}`);
  console.log(`  Shopping states: ${parsed.shoppingStates.length}`);
  console.log(`  Extra catalog items: ${parsed.extraItemCatalog.length}`);
  console.log(`  Extra shopping items: ${parsed.extraShoppingItems.length}`);
  console.log(`  Shopping stores: ${parsed.shoppingStores.length}`);
  console.log(`  Shopping preferences: ${parsed.shoppingPreferences.length}`);
  console.log(`  Device preferences (legacy, ignored): ${parsed.devicePreferences.length}`);
}

async function truncateCurrentData() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "Account",
      "Session",
      "Verification",
      "HouseholdInvitation",
      "HouseholdMember",
      "UserPreference",
      "AllowedEmail",
      "FreezerItem",
      "ShoppingPackageItem",
      "ShoppingPackage",
      "ExtraShoppingItem",
      "ShoppingState",
      "WeekPlanEntry",
      "WeekPlan",
      "WeekIndex",
      "RecipeIngredient",
      "ShoppingStore",
      "ExtraItemCatalog",
      "Ingredient",
      "Recipe",
      "Household",
      "User"
    RESTART IDENTITY CASCADE
  `);
}

export async function importProdDump(
  dumpPath: string,
  options: ImportProdDumpOptions = {},
) {
  const sql = await readFile(dumpPath, "utf8");
  const parsed = parseProdDump(sql);

  console.log(`Leste prod-dump fra ${dumpPath}`);
  logSummary(parsed);

  if (options.dryRun) {
    console.log("Dry run ferdig. Ingen data ble skrevet til databasen.");
    return;
  }

  const seedUsers = buildSeedUsers(process.env.ADMIN_EMAIL);
  const shoppingPreferenceByRole = new Map(
    parsed.shoppingPreferences
      .map((row) => {
        const role = row.role;
        return role === "JENS" || role === "INGVILD" ? [role, row] : null;
      })
      .filter((entry): entry is [LegacyRole, CopyRow] => entry !== null),
  );

  await truncateCurrentData();

  await prisma.$transaction(async (tx) => {
    const household = await tx.household.create({
      data: { name: MIGRATED_HOUSEHOLD_NAME },
    });

    await tx.recipe.createMany({
      data: parsed.recipes.map((row) => ({
        id: row.id!,
        name: row.name!,
        description: row.description,
        category: row.category as "FISK" | "VEGETAR" | "KYLLING" | "STORFE" | "ANNET",
        everydayScore: Number.parseInt(row.everydayScore!, 10),
        healthScore: Number.parseInt(row.healthScore!, 10),
        lastUsed: parsePgTimestamp(row.lastUsed),
        usageCount: Number.parseInt(row.usageCount!, 10),
        createdAt: parsePgTimestamp(row.createdAt)!,
        updatedAt: parsePgTimestamp(row.updatedAt)!,
      })),
    });

    await tx.ingredient.createMany({
      data: parsed.ingredients.map((row) => ({
        id: row.id!,
        name: row.name!,
        unit: row.unit,
        isPantryItem: parsePgBoolean(row.isPantryItem),
        category: row.category as
          | "FRUKT_OG_GRONT"
          | "KJOTT"
          | "OST"
          | "MEIERI_OG_EGG"
          | "BROD"
          | "BAKEVARER"
          | "HERMETIKK"
          | "TORRVARER"
          | "HUSHOLDNING"
          | "ANNET",
      })),
    });

    await tx.recipeIngredient.createMany({
      data: parsed.recipeIngredients.map((row) => ({
        recipeId: row.recipeId!,
        ingredientId: row.ingredientId!,
        quantity: row.quantity,
        notes: row.notes,
      })),
    });

    await tx.weekIndex.createMany({
      data: parsed.weekIndices.map((row) => ({
        id: row.id!,
        weekStart: parsePgTimestamp(row.weekStart)!,
        householdId: household.id,
        createdAt: parsePgTimestamp(row.createdAt)!,
      })),
    });

    await tx.weekPlan.createMany({
      data: parsed.weekPlans.map((row) => ({
        id: row.id!,
        weekStart: parsePgTimestamp(row.weekStart)!,
        weekIndexId: row.weekIndexId,
        householdId: household.id,
        createdAt: parsePgTimestamp(row.createdAt)!,
        updatedAt: parsePgTimestamp(row.updatedAt)!,
      })),
    });

    await tx.weekPlanEntry.createMany({
      data: parsed.weekPlanEntries.map((row) => ({
        id: row.id!,
        weekPlanId: row.weekPlanId!,
        dayIndex: Number.parseInt(row.dayIndex!, 10),
        recipeId: row.recipeId,
        entryType: row.entryType as "RECIPE" | "TAKEAWAY" | "FREEZER",
      })),
    });

    await tx.shoppingState.createMany({
      data: parsed.shoppingStates.map((row) => ({
        id: row.id!,
        weekStart: parsePgTimestamp(row.weekStart)!,
        ingredientId: row.ingredientId!,
        unit: row.unit,
        checked: parsePgBoolean(row.checked),
        firstCheckedDayIndex:
          row.firstCheckedDayIndex == null
            ? null
            : Number.parseInt(row.firstCheckedDayIndex, 10),
        householdId: household.id,
        createdAt: parsePgTimestamp(row.createdAt)!,
        updatedAt: parsePgTimestamp(row.updatedAt)!,
      })),
    });

    await tx.extraItemCatalog.createMany({
      data: parsed.extraItemCatalog.map((row) => ({
        id: row.id!,
        name: row.name!,
        category: row.category as
          | "FRUKT_OG_GRONT"
          | "KJOTT"
          | "OST"
          | "MEIERI_OG_EGG"
          | "BROD"
          | "BAKEVARER"
          | "HERMETIKK"
          | "TORRVARER"
          | "HUSHOLDNING"
          | "ANNET"
          | null,
        householdId: household.id,
        createdAt: parsePgTimestamp(row.createdAt)!,
        updatedAt: parsePgTimestamp(row.updatedAt)!,
      })),
    });

    await tx.extraShoppingItem.createMany({
      data: parsed.extraShoppingItems.map((row) => ({
        id: row.id!,
        weekStart: parsePgTimestamp(row.weekStart)!,
        catalogItemId: row.catalogItemId!,
        checked: parsePgBoolean(row.checked),
        householdId: household.id,
        createdAt: parsePgTimestamp(row.createdAt)!,
        updatedAt: parsePgTimestamp(row.updatedAt)!,
      })),
    });

    if (parsed.shoppingStores.length > 0) {
      await tx.shoppingStore.createMany({
        data: parsed.shoppingStores.map((row) => ({
          id: row.id!,
          name: row.name!,
          categoryOrder: parsePgArray(row.categoryOrder) as Array<
            | "FRUKT_OG_GRONT"
            | "KJOTT"
            | "OST"
            | "BROD"
            | "MEIERI_OG_EGG"
            | "HERMETIKK"
            | "TORRVARER"
            | "BAKEVARER"
            | "HUSHOLDNING"
            | "ANNET"
          >,
          isDefault: parsePgBoolean(row.isDefault),
          householdId: household.id,
          createdAt: parsePgTimestamp(row.createdAt)!,
          updatedAt: parsePgTimestamp(row.updatedAt)!,
        })),
      });
    } else {
      await tx.shoppingStore.create({
        data: {
          name: "Standard butikk",
          categoryOrder: [...STANDARD_STORE_CATEGORY_ORDER],
          isDefault: true,
          householdId: household.id,
        },
      });
    }

    await tx.allowedEmail.createMany({
      data: seedUsers.map((user) => ({
        email: user.email,
      })),
    });

    await tx.user.createMany({
      data: seedUsers.map((user) => ({
        id: createUserId(user.email),
        email: user.email,
        name: user.name,
        emailVerified: true,
        role: user.appRole,
      })),
    });

    await tx.householdMember.createMany({
      data: seedUsers.map((user) => ({
        householdId: household.id,
        userId: createUserId(user.email),
        role: user.householdRole,
      })),
    });

    const userPreferences = seedUsers.flatMap((user) => {
      const sourceRole = user.preferenceSourceRole;
      const preference = sourceRole ? shoppingPreferenceByRole.get(sourceRole) : null;
      if (!preference) return [];

      return [
        {
          userId: createUserId(user.email),
          defaultViewMode: preference.defaultViewMode as
            | "BY_DAY"
            | "ALPHABETICAL"
            | "BY_CATEGORY",
          startDay: Number.parseInt(preference.startDay!, 10),
          includeNextWeek: parsePgBoolean(preference.includeNextWeek),
          showPantryWithIngredients: parsePgBoolean(preference.showPantryWithIngredients),
          visibleDayIndices: parsePgIntArray(preference.visibleDayIndices),
          defaultStoreId: preference.defaultStoreId,
          createdAt: parsePgTimestamp(preference.createdAt)!,
          updatedAt: parsePgTimestamp(preference.updatedAt)!,
        },
      ];
    });

    if (userPreferences.length > 0) {
      await tx.userPreference.createMany({
        data: userPreferences,
      });
    }
  });

  console.log("Prod-data importert til dagens dev-schema.");
}
