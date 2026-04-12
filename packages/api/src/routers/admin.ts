import { z } from "zod";
import { adminProcedure, authenticatedProcedure, router } from "../trpc.js";
import { prisma } from "@repo/database";

export const adminRouter = router({
  /** List all allowed emails */
  listAllowedEmails: adminProcedure.query(async () => {
    return prisma.allowedEmail.findMany({
      orderBy: { createdAt: "asc" },
    });
  }),

  /** Add an email to the allowlist */
  addAllowedEmail: adminProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input, ctx }) => {
      return prisma.allowedEmail.upsert({
        where: { email: input.email.toLowerCase() },
        update: {},
        create: {
          email: input.email.toLowerCase(),
          addedBy: ctx.user.id,
        },
      });
    }),

  /** Remove an email from the allowlist */
  removeAllowedEmail: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      return prisma.allowedEmail.delete({
        where: { id: input.id },
      });
    }),

  /** List all users */
  listUsers: adminProcedure.query(async () => {
    return prisma.user.findMany({
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
  }),

  /** Update a user's app role */
  updateUserRole: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        role: z.enum(["USER", "ADMIN"]),
      }),
    )
    .mutation(async ({ input }) => {
      return prisma.user.update({
        where: { id: input.userId },
        data: { role: input.role },
      });
    }),

  /** List all households with members */
  listHouseholds: adminProcedure.query(async () => {
    return prisma.household.findMany({
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
  }),

  /** Create a new household */
  createHousehold: adminProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      return prisma.household.create({
        data: { name: input.name },
      });
    }),

  /** Add a user to a household */
  addHouseholdMember: adminProcedure
    .input(
      z.object({
        householdId: z.string(),
        userId: z.string(),
        role: z.enum(["OWNER", "MEMBER"]).default("MEMBER"),
      }),
    )
    .mutation(async ({ input }) => {
      return prisma.householdMember.upsert({
        where: {
          householdId_userId: {
            householdId: input.householdId,
            userId: input.userId,
          },
        },
        update: { role: input.role },
        create: {
          householdId: input.householdId,
          userId: input.userId,
          role: input.role,
        },
      });
    }),

  /** Remove a member from a household */
  removeHouseholdMember: adminProcedure
    .input(z.object({ membershipId: z.string() }))
    .mutation(async ({ input }) => {
      return prisma.householdMember.delete({
        where: { id: input.membershipId },
      });
    }),

  /** Rename a household */
  renameHousehold: adminProcedure
    .input(z.object({ householdId: z.string(), name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      return prisma.household.update({
        where: { id: input.householdId },
        data: { name: input.name },
      });
    }),

  /** Delete a household */
  deleteHousehold: adminProcedure
    .input(z.object({ householdId: z.string() }))
    .mutation(async ({ input }) => {
      return prisma.household.delete({
        where: { id: input.householdId },
      });
    }),

  /** Get current user's role (available to any authenticated user) */
  myRole: authenticatedProcedure.query(async ({ ctx }) => {
    return { role: ctx.user.role };
  }),
});
