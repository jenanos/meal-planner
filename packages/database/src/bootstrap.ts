import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./client";

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

type BootstrapDbClient = PrismaClient | Prisma.TransactionClient;

export type BootstrapMemberRole = "OWNER" | "MEMBER";

export type BootstrapMember = {
  email: string;
  role: BootstrapMemberRole;
  name: string;
};

export type BootstrapConfig = {
  adminEmail: string | null;
  householdName: string | null;
  householdMembers: BootstrapMember[];
  allowlistedEmails: string[];
};

type HouseholdCountSnapshot = {
  weekPlans: number;
  weekIndices: number;
  shoppingStates: number;
  extraCatalog: number;
  extraItems: number;
  shoppingStores: number;
  shoppingPackages: number;
  freezerItems: number;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function optionalEnvValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseEmailList(value: string | undefined) {
  if (!value) return [];

  const seen = new Set<string>();
  return value
    .split(",")
    .map((entry) => normalizeEmail(entry))
    .filter((entry) => entry.includes("@"))
    .filter((entry) => {
      if (seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
}

export function deriveDisplayNameFromEmail(email: string) {
  const [localPart = "Bruker"] = normalizeEmail(email).split("@");
  const parts = localPart
    .split(/[._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) {
    return "Bruker";
  }

  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getBootstrapConfigFromEnv(): BootstrapConfig {
  const adminEmail = optionalEnvValue(process.env.ADMIN_EMAIL);
  const householdName = optionalEnvValue(
    process.env.BOOTSTRAP_HOUSEHOLD_NAME,
  );
  const ownerEmails = parseEmailList(
    process.env.BOOTSTRAP_HOUSEHOLD_OWNER_EMAILS,
  );
  const memberEmails = parseEmailList(
    process.env.BOOTSTRAP_HOUSEHOLD_MEMBER_EMAILS,
  );

  const memberRoles = new Map<string, BootstrapMemberRole>();
  for (const email of ownerEmails) {
    memberRoles.set(email, "OWNER");
  }
  for (const email of memberEmails) {
    if (!memberRoles.has(email)) {
      memberRoles.set(email, "MEMBER");
    }
  }

  const normalizedAdminEmail = adminEmail ? normalizeEmail(adminEmail) : null;
  if (
    householdName &&
    normalizedAdminEmail &&
    memberRoles.size === 0
  ) {
    memberRoles.set(normalizedAdminEmail, "OWNER");
  }

  const householdMembers = Array.from(memberRoles.entries()).map(
    ([email, role]) => ({
      email,
      role,
      name: deriveDisplayNameFromEmail(email),
    }),
  );

  const allowlistedEmails = Array.from(
    new Set([
      ...(normalizedAdminEmail ? [normalizedAdminEmail] : []),
      ...householdMembers.map((member) => member.email),
    ]),
  );

  return {
    adminEmail: normalizedAdminEmail,
    householdName,
    householdMembers,
    allowlistedEmails,
  };
}

function hasHouseholdData(counts: HouseholdCountSnapshot) {
  return Object.values(counts).some((count) => count > 0);
}

async function listDataBearingOrphanHouseholds(
  db: BootstrapDbClient,
  excludeHouseholdIds: string[] = [],
) {
  const households = await db.household.findMany({
    where: {
      members: { none: {} },
      ...(excludeHouseholdIds.length
        ? { id: { notIn: excludeHouseholdIds } }
        : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          weekPlans: true,
          weekIndices: true,
          shoppingStates: true,
          extraCatalog: true,
          extraItems: true,
          shoppingStores: true,
          shoppingPackages: true,
          freezerItems: true,
        },
      },
    },
  });

  return households.filter((household) => hasHouseholdData(household._count));
}

async function ensureAllowedEmails(
  db: BootstrapDbClient,
  emails: string[],
) {
  if (!emails.length) return;

  await db.allowedEmail.createMany({
    data: emails.map((email) => ({ email })),
    skipDuplicates: true,
  });
}

async function ensureDefaultStore(
  db: BootstrapDbClient,
  householdId: string,
) {
  const defaultStore = await db.shoppingStore.findFirst({
    where: { householdId, isDefault: true },
    select: { id: true },
  });
  if (defaultStore) {
    return;
  }

  const oldestStore = await db.shoppingStore.findFirst({
    where: { householdId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (oldestStore) {
    await db.shoppingStore.update({
      where: { id: oldestStore.id },
      data: { isDefault: true },
    });
    return;
  }

  await db.shoppingStore.create({
    data: {
      name: "Standard butikk",
      isDefault: true,
      householdId,
      categoryOrder: [...STANDARD_STORE_CATEGORY_ORDER],
    },
  });
}

async function moveHouseholdScopedData(
  db: BootstrapDbClient,
  sourceHouseholdId: string,
  targetHouseholdId: string,
) {
  await db.weekPlan.updateMany({
    where: { householdId: sourceHouseholdId },
    data: { householdId: targetHouseholdId },
  });
  await db.weekIndex.updateMany({
    where: { householdId: sourceHouseholdId },
    data: { householdId: targetHouseholdId },
  });
  await db.shoppingState.updateMany({
    where: { householdId: sourceHouseholdId },
    data: { householdId: targetHouseholdId },
  });
  await db.extraItemCatalog.updateMany({
    where: { householdId: sourceHouseholdId },
    data: { householdId: targetHouseholdId },
  });
  await db.extraShoppingItem.updateMany({
    where: { householdId: sourceHouseholdId },
    data: { householdId: targetHouseholdId },
  });
  await db.shoppingStore.updateMany({
    where: { householdId: sourceHouseholdId },
    data: { householdId: targetHouseholdId },
  });
  await db.shoppingPackage.updateMany({
    where: { householdId: sourceHouseholdId },
    data: { householdId: targetHouseholdId },
  });
  await db.freezerItem.updateMany({
    where: { householdId: sourceHouseholdId },
    data: { householdId: targetHouseholdId },
  });
}

async function maybeMoveSingleOrphanHouseholdIntoTarget(
  db: BootstrapDbClient,
  targetHouseholdId: string,
) {
  const target = await db.household.findUnique({
    where: { id: targetHouseholdId },
    select: {
      _count: {
        select: {
          weekPlans: true,
          weekIndices: true,
          shoppingStates: true,
          extraCatalog: true,
          extraItems: true,
          shoppingStores: true,
          shoppingPackages: true,
          freezerItems: true,
        },
      },
    },
  });

  if (!target) {
    return;
  }

  const orphanHouseholds = await listDataBearingOrphanHouseholds(db, [
    targetHouseholdId,
  ]);
  if (!orphanHouseholds.length) {
    return;
  }

  if (hasHouseholdData(target._count)) {
    console.warn(
      `Bootstrap household ${targetHouseholdId} already has data; skipping automatic migration of ${orphanHouseholds.length} orphan household(s).`,
    );
    return;
  }

  if (orphanHouseholds.length > 1) {
    console.warn(
      `Found ${orphanHouseholds.length} orphan households with data; skipping automatic merge because it may violate household-scoped uniqueness constraints.`,
    );
    return;
  }

  const [source] = orphanHouseholds;
  await moveHouseholdScopedData(db, source.id, targetHouseholdId);
  await db.household.deleteMany({
    where: {
      id: source.id,
      members: { none: {} },
      weekPlans: { none: {} },
      weekIndices: { none: {} },
      shoppingStates: { none: {} },
      extraCatalog: { none: {} },
      extraItems: { none: {} },
      shoppingStores: { none: {} },
      shoppingPackages: { none: {} },
      freezerItems: { none: {} },
    },
  });
}

async function ensureBootstrapHousehold(
  db: BootstrapDbClient,
  householdName: string,
) {
  const existingHousehold = await db.household.findFirst({
    where: { name: householdName },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (existingHousehold) {
    return existingHousehold.id;
  }

  const [reusableOrphan] = await listDataBearingOrphanHouseholds(db);
  if (reusableOrphan) {
    const renamed = await db.household.update({
      where: { id: reusableOrphan.id },
      data: { name: householdName },
      select: { id: true },
    });
    return renamed.id;
  }

  const created = await db.household.create({
    data: { name: householdName },
    select: { id: true },
  });
  return created.id;
}

async function syncExistingConfiguredUsers(
  db: BootstrapDbClient,
  householdId: string | null,
  config: BootstrapConfig,
) {
  if (!config.allowlistedEmails.length) {
    return;
  }

  if (config.adminEmail) {
    await db.user.updateMany({
      where: { email: config.adminEmail },
      data: { role: "ADMIN" },
    });
  }

  if (!householdId || !config.householdMembers.length) {
    return;
  }

  const memberRoleByEmail = new Map(
    config.householdMembers.map((member) => [member.email, member.role]),
  );
  const users = await db.user.findMany({
    where: { email: { in: config.householdMembers.map((member) => member.email) } },
    select: { id: true, email: true },
  });

  for (const user of users) {
    const role = memberRoleByEmail.get(user.email);
    if (!role) continue;

    await db.householdMember.upsert({
      where: {
        householdId_userId: {
          householdId,
          userId: user.id,
        },
      },
      update: { role },
      create: {
        householdId,
        userId: user.id,
        role,
      },
    });
  }
}

export async function ensureBootstrapState(db: BootstrapDbClient = prisma) {
  const config = getBootstrapConfigFromEnv();

  await ensureAllowedEmails(db, config.allowlistedEmails);

  let householdId: string | null = null;
  if (config.householdName && config.householdMembers.length) {
    householdId = await ensureBootstrapHousehold(db, config.householdName);
    await maybeMoveSingleOrphanHouseholdIntoTarget(db, householdId);
    await ensureDefaultStore(db, householdId);
  }

  await syncExistingConfiguredUsers(db, householdId, config);

  return {
    config,
    householdId,
  };
}

export async function syncBootstrapStateForUser(
  user: { id: string; email: string },
  db: BootstrapDbClient = prisma,
) {
  const config = getBootstrapConfigFromEnv();
  const email = normalizeEmail(user.email);

  if (config.allowlistedEmails.includes(email)) {
    await db.allowedEmail.upsert({
      where: { email },
      update: {},
      create: { email },
    });
  }

  if (config.adminEmail === email) {
    await db.user.update({
      where: { id: user.id },
      data: { role: "ADMIN" },
    });
  }

  if (!config.householdName) {
    return null;
  }

  const member = config.householdMembers.find(
    (candidate) => candidate.email === email,
  );
  if (!member) {
    return null;
  }

  const householdId = await ensureBootstrapHousehold(db, config.householdName);
  await ensureDefaultStore(db, householdId);
  await db.householdMember.upsert({
    where: {
      householdId_userId: {
        householdId,
        userId: user.id,
      },
    },
    update: { role: member.role },
    create: {
      householdId,
      userId: user.id,
      role: member.role,
    },
  });

  return householdId;
}
