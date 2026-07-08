import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    allowedEmail: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    session: {
      deleteMany: vi.fn(),
    },
    household: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    householdMember: {
      upsert: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@repo/database", () => ({
  prisma: prismaMock,
}));

import { adminRouter } from "../src/routers/admin";

const ADMIN_USER = {
  id: "00000000-0000-0000-0000-000000000101",
  email: "admin@example.com",
  name: "Admin",
  role: "ADMIN" as const,
};

const MEMBER_USER = {
  id: "00000000-0000-0000-0000-000000000102",
  email: "user@example.com",
  name: "User",
  role: "USER" as const,
};

const createCaller = (user: typeof ADMIN_USER | typeof MEMBER_USER | null = ADMIN_USER) =>
  adminRouter.createCaller({ user, householdId: null });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin router", () => {
  it("lists allowed emails", async () => {
    prismaMock.allowedEmail.findMany.mockResolvedValueOnce([
      { id: "ae1", email: "test@example.com" },
    ]);

    const result = await createCaller().listAllowedEmails();

    expect(prismaMock.allowedEmail.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "asc" },
    });
    expect(result).toEqual([{ id: "ae1", email: "test@example.com" }]);
  });

  it("adds allowed emails in lowercase using the admin user id", async () => {
    prismaMock.allowedEmail.upsert.mockResolvedValueOnce({
      id: "ae2",
      email: "new@example.com",
      addedBy: ADMIN_USER.id,
    });

    const result = await createCaller().addAllowedEmail({
      email: "  NEW@Example.com  ",
    });

    expect(prismaMock.allowedEmail.upsert).toHaveBeenCalledWith({
      where: { email: "new@example.com" },
      update: {},
      create: {
        email: "new@example.com",
        addedBy: ADMIN_USER.id,
      },
    });
    expect(result.email).toBe("new@example.com");
  });

  it("removes allowed emails and revokes the user's sessions", async () => {
    prismaMock.allowedEmail.delete.mockResolvedValueOnce({
      id: "ae3",
      email: "gone@example.com",
    });
    prismaMock.session.deleteMany.mockResolvedValueOnce({ count: 2 });

    await createCaller().removeAllowedEmail({ id: "ae3" });

    expect(prismaMock.allowedEmail.delete).toHaveBeenCalledWith({
      where: { id: "ae3" },
    });
    expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({
      where: {
        user: { email: { equals: "gone@example.com", mode: "insensitive" } },
      },
    });
  });

  it("lists users with memberships", async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: "u1", email: "user@example.com", memberships: [] },
    ]);

    const result = await createCaller().listUsers();

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        memberships: {
          select: {
            household: { select: { id: true, name: true } },
            role: true,
          },
        },
      },
    });
    expect(result[0].id).toBe("u1");
  });

  it("updates user roles", async () => {
    prismaMock.user.update.mockResolvedValueOnce({
      id: "u2",
      role: "ADMIN",
    });

    const result = await createCaller().updateUserRole({
      userId: "u2",
      role: "ADMIN",
    });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "u2" },
      data: { role: "ADMIN" },
    });
    expect(result.role).toBe("ADMIN");
  });

  it("demotes an admin when another admin remains", async () => {
    prismaMock.user.count.mockResolvedValueOnce(1);
    prismaMock.user.update.mockResolvedValueOnce({ id: "u2", role: "USER" });

    const result = await createCaller().updateUserRole({
      userId: "u2",
      role: "USER",
    });

    expect(prismaMock.user.count).toHaveBeenCalledWith({
      where: { role: "ADMIN", id: { not: "u2" } },
    });
    expect(result.role).toBe("USER");
  });

  it("refuses to demote the last remaining admin", async () => {
    prismaMock.user.count.mockResolvedValueOnce(0);

    await expect(
      createCaller().updateUserRole({ userId: "u2", role: "USER" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("lists households with members", async () => {
    prismaMock.household.findMany.mockResolvedValueOnce([
      { id: "h1", name: "Home", members: [] },
    ]);

    const result = await createCaller().listHouseholds();

    expect(prismaMock.household.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        members: {
          select: {
            id: true,
            role: true,
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });
    expect(result[0].name).toBe("Home");
  });

  it("creates, renames, and deletes households", async () => {
    prismaMock.household.create.mockResolvedValueOnce({ id: "h2", name: "New Home" });
    prismaMock.household.update.mockResolvedValueOnce({ id: "h2", name: "Renamed" });
    prismaMock.household.delete.mockResolvedValueOnce({ id: "h2" });

    await createCaller().createHousehold({ name: "New Home" });
    await createCaller().renameHousehold({ householdId: "h2", name: "Renamed" });
    await createCaller().deleteHousehold({ householdId: "h2" });

    expect(prismaMock.household.create).toHaveBeenCalledWith({
      data: { name: "New Home" },
    });
    expect(prismaMock.household.update).toHaveBeenCalledWith({
      where: { id: "h2" },
      data: { name: "Renamed" },
    });
    expect(prismaMock.household.delete).toHaveBeenCalledWith({
      where: { id: "h2" },
    });
  });

  it("adds and removes household members", async () => {
    prismaMock.householdMember.upsert.mockResolvedValueOnce({
      id: "hm1",
      householdId: "h3",
      userId: "u3",
      role: "OWNER",
    });
    prismaMock.householdMember.delete.mockResolvedValueOnce({ id: "hm1" });

    const result = await createCaller().addHouseholdMember({
      householdId: "h3",
      userId: "u3",
      role: "OWNER",
    });
    await createCaller().removeHouseholdMember({ membershipId: "hm1" });

    expect(prismaMock.householdMember.upsert).toHaveBeenCalledWith({
      where: {
        householdId_userId: {
          householdId: "h3",
          userId: "u3",
        },
      },
      update: { role: "OWNER" },
      create: {
        householdId: "h3",
        userId: "u3",
        role: "OWNER",
      },
    });
    expect(prismaMock.householdMember.delete).toHaveBeenCalledWith({
      where: { id: "hm1" },
    });
    expect(result.role).toBe("OWNER");
  });

  it("returns the current user's role for authenticated users", async () => {
    const result = await createCaller(ADMIN_USER).myRole();
    expect(result).toEqual({ role: "ADMIN" });
  });

  it("blocks unauthenticated and non-admin callers", async () => {
    await expect(createCaller(null).listAllowedEmails()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(createCaller(MEMBER_USER).listAllowedEmails()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
