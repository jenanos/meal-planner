import * as z from "zod";
import type { MealsApi } from "../api.js";
import {
  ToolError,
  defineTool,
  matchByName,
  type ToolContext,
} from "./helpers.js";

const userRefArgs = {
  userId: z
    .string()
    .min(1)
    .optional()
    .describe("Brukerens ID. Oppgi enten denne eller email."),
  email: z
    .string()
    .email()
    .optional()
    .describe("Brukerens e-postadresse, som alternativ til userId."),
};

const householdRefArgs = {
  householdId: z
    .string()
    .min(1)
    .optional()
    .describe("Husholdningens ID. Oppgi enten denne eller householdName."),
  householdName: z
    .string()
    .min(1)
    .optional()
    .describe("Husholdningens navn, som alternativ til householdId."),
};

async function resolveUserId(
  api: MealsApi,
  ref: { userId?: string; email?: string },
): Promise<string> {
  if (ref.userId) return ref.userId;
  const email = ref.email?.trim().toLowerCase();
  if (!email) throw new ToolError("Oppgi enten userId eller email.");
  const users = await api.admin.listUsers.query();
  const user = users.find((u) => u.email.toLowerCase() === email);
  if (!user) {
    throw new ToolError(
      `Fant ingen bruker med e-post ${email}. Brukeren må ha logget inn minst én gang; se admin-list-users.`,
    );
  }
  return user.id;
}

async function resolveHouseholdId(
  api: MealsApi,
  ref: { householdId?: string; householdName?: string },
): Promise<string> {
  if (ref.householdId) return ref.householdId;
  const name = ref.householdName?.trim();
  if (!name)
    throw new ToolError("Oppgi enten householdId eller householdName.");
  const households = await api.admin.listHouseholds.query();
  const { match, candidates } = matchByName(households, name);
  if (match && candidates.length === 1) return match.id;
  throw new ToolError(
    candidates.length
      ? `Flere husholdninger passer til "${name}". Bruk householdId.`
      : `Fant ingen husholdning som heter "${name}".`,
    { candidates: candidates.map(({ id, name: n }) => ({ id, name: n })) },
  );
}

/**
 * User, allowlist and household administration. Only registered for callers
 * with the ADMIN role; the API enforces the same check on every call.
 */
export function registerAdminTools(ctx: ToolContext) {
  const { api } = ctx;

  // ─── Allowlist ─────────────────────────────────────────────────────

  defineTool(
    ctx,
    "admin-list-allowed-emails",
    {
      title: "Admin: list tillatte e-poster",
      description:
        "Lister e-postadressene som har lov til å logge inn i Meal Planner. Bare adresser på denne listen kan opprette bruker.",
      kind: "read",
      errorContext: "Kunne ikke hente tillatte e-poster",
      input: {},
    },
    async () => {
      const emails = await api.admin.listAllowedEmails.query();
      return { count: emails.length, emails };
    },
  );

  defineTool(
    ctx,
    "admin-add-allowed-email",
    {
      title: "Admin: tillat e-post",
      description:
        "Gir en e-postadresse lov til å logge inn i Meal Planner. Personen får tilgang til appen ved neste innlogging; " +
        "legg dem i en husholdning med admin-set-household-member etter at de har logget inn første gang.",
      kind: "set",
      errorContext: "Kunne ikke legge til e-post",
      input: {
        email: z
          .string()
          .trim()
          .email()
          .describe("E-postadressen som skal få tilgang."),
      },
    },
    async ({ email }) => {
      const entry = await api.admin.addAllowedEmail.mutate({ email });
      return { entry };
    },
  );

  defineTool(
    ctx,
    "admin-remove-allowed-email",
    {
      title: "Admin: fjern tillatt e-post",
      description:
        "Fjerner en e-postadresse fra listen over tillatte innlogginger og logger brukeren ut umiddelbart overalt. " +
        "Brukerens data og husholdningsmedlemskap slettes ikke.",
      kind: "destructive",
      errorContext: "Kunne ikke fjerne e-post",
      input: {
        id: z
          .string()
          .min(1)
          .optional()
          .describe("Oppføringens ID. Oppgi enten denne eller email."),
        email: z
          .string()
          .trim()
          .email()
          .optional()
          .describe("E-postadressen som skal fjernes."),
      },
    },
    async ({ id, email }) => {
      let entryId = id;
      if (!entryId) {
        if (!email) throw new ToolError("Oppgi enten id eller email.");
        const entries = await api.admin.listAllowedEmails.query();
        entryId = entries.find(
          (entry) => entry.email.toLowerCase() === email.toLowerCase(),
        )?.id;
        if (!entryId) {
          throw new ToolError(
            `${email} står ikke på listen over tillatte e-poster.`,
          );
        }
      }
      const removed = await api.admin.removeAllowedEmail.mutate({
        id: entryId,
      });
      return { ok: true, removed: { id: removed.id, email: removed.email } };
    },
  );

  // ─── Users ─────────────────────────────────────────────────────────

  defineTool(
    ctx,
    "admin-list-users",
    {
      title: "Admin: list brukere",
      description:
        "Lister alle brukere med rolle (USER/ADMIN) og hvilke husholdninger de er medlem av.",
      kind: "read",
      errorContext: "Kunne ikke hente brukere",
      input: {},
    },
    async () => {
      const users = await api.admin.listUsers.query();
      return {
        count: users.length,
        users: users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
          households: (
            user.memberships as {
              role: string;
              household: { id: string; name: string };
            }[]
          ).map((membership) => ({
            id: membership.household.id,
            name: membership.household.name,
            role: membership.role,
          })),
        })),
      };
    },
  );

  defineTool(
    ctx,
    "admin-set-user-role",
    {
      title: "Admin: sett brukerrolle",
      description:
        "Gjør en bruker til administrator (ADMIN) eller vanlig bruker (USER). " +
        "Administratorer kan styre brukere, tilganger og husholdninger. Den siste administratoren kan ikke degraderes.",
      kind: "set",
      errorContext: "Kunne ikke endre rolle",
      input: {
        ...userRefArgs,
        role: z.enum(["USER", "ADMIN"]).describe("Ny rolle."),
      },
    },
    async ({ userId, email, role }) => {
      const id = await resolveUserId(api, { userId, email });
      const user = await api.admin.updateUserRole.mutate({ userId: id, role });
      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      };
    },
  );

  // ─── Households ────────────────────────────────────────────────────

  defineTool(
    ctx,
    "admin-list-households",
    {
      title: "Admin: list husholdninger",
      description:
        "Lister alle husholdninger med medlemmer. Ukesplaner, handlelister, fryser, pakker og butikker tilhører en husholdning. " +
        "Hvert medlem har en membershipId som brukes for å fjerne medlemmet.",
      kind: "read",
      errorContext: "Kunne ikke hente husholdninger",
      input: {},
    },
    async () => {
      const households = await api.admin.listHouseholds.query();
      return {
        count: households.length,
        households: households.map((household) => ({
          id: household.id,
          name: household.name,
          createdAt: household.createdAt,
          members: household.members.map((member) => ({
            membershipId: member.id,
            userId: member.user.id,
            name: member.user.name,
            email: member.user.email,
            role: member.role,
          })),
        })),
      };
    },
  );

  defineTool(
    ctx,
    "admin-create-household",
    {
      title: "Admin: opprett husholdning",
      description:
        "Oppretter en ny, tom husholdning. Legg til medlemmer med admin-set-household-member.",
      kind: "add",
      errorContext: "Kunne ikke opprette husholdning",
      input: {
        name: z.string().trim().min(1).describe("Navn på husholdningen."),
      },
    },
    async ({ name }) => {
      const household = await api.admin.createHousehold.mutate({ name });
      return { household: { id: household.id, name: household.name } };
    },
  );

  defineTool(
    ctx,
    "admin-rename-household",
    {
      title: "Admin: gi husholdning nytt navn",
      description: "Gir en husholdning nytt navn.",
      kind: "set",
      errorContext: "Kunne ikke endre navn på husholdning",
      input: {
        ...householdRefArgs,
        newName: z.string().trim().min(1).describe("Det nye navnet."),
      },
    },
    async ({ householdId, householdName, newName }) => {
      const id = await resolveHouseholdId(api, { householdId, householdName });
      const household = await api.admin.renameHousehold.mutate({
        householdId: id,
        name: newName,
      });
      return { household: { id: household.id, name: household.name } };
    },
  );

  defineTool(
    ctx,
    "admin-delete-household",
    {
      title: "Admin: slett husholdning",
      description:
        "Sletter en husholdning PERMANENT, sammen med alle dens ukesplaner, handlelister, ekstra-katalog, pakker, butikker og fryserbeholdning. " +
        "Kan ikke angres. Krever ID (ikke navn) og confirmName lik husholdningens navn, som sikring mot å slette feil husholdning.",
      kind: "destructive",
      errorContext: "Kunne ikke slette husholdning",
      input: {
        householdId: z.string().min(1).describe("Husholdningens ID."),
        confirmName: z
          .string()
          .min(1)
          .describe(
            "Husholdningens navn, nøyaktig slik det står, som bekreftelse.",
          ),
      },
    },
    async ({ householdId, confirmName }) => {
      const households = await api.admin.listHouseholds.query();
      const target = households.find(
        (household) => household.id === householdId,
      );
      if (!target) {
        throw new ToolError("Fant ingen husholdning med denne ID-en.");
      }
      if (target.name !== confirmName) {
        throw new ToolError(
          `confirmName stemmer ikke med husholdningens navn ("${target.name}"). Ingenting ble slettet.`,
        );
      }
      await api.admin.deleteHousehold.mutate({ householdId });
      return {
        ok: true,
        deleted: {
          id: target.id,
          name: target.name,
          members: target.members.length,
        },
      };
    },
  );

  defineTool(
    ctx,
    "admin-set-household-member",
    {
      title: "Admin: legg bruker i husholdning",
      description:
        "Legger en bruker til i en husholdning, eller endrer rollen til et eksisterende medlem (OWNER eller MEMBER). " +
        "Brukeren må ha logget inn minst én gang.",
      kind: "set",
      errorContext: "Kunne ikke oppdatere medlemskap",
      input: {
        ...householdRefArgs,
        ...userRefArgs,
        role: z
          .enum(["OWNER", "MEMBER"])
          .optional()
          .describe("Rolle i husholdningen (standard MEMBER)."),
      },
    },
    async ({ householdId, householdName, userId, email, role }) => {
      const [resolvedHouseholdId, resolvedUserId] = [
        await resolveHouseholdId(api, { householdId, householdName }),
        await resolveUserId(api, { userId, email }),
      ];
      const membership = await api.admin.addHouseholdMember.mutate({
        householdId: resolvedHouseholdId,
        userId: resolvedUserId,
        role: role ?? "MEMBER",
      });
      return {
        membership: {
          membershipId: membership.id,
          householdId: membership.householdId,
          userId: membership.userId,
          role: membership.role,
        },
      };
    },
  );

  defineTool(
    ctx,
    "admin-remove-household-member",
    {
      title: "Admin: fjern medlem fra husholdning",
      description:
        "Fjerner en bruker fra en husholdning. Brukeren mister tilgangen til husholdningens data, men brukerkontoen og dataene består. " +
        "Oppgi membershipId (fra admin-list-households), eller husholdning og bruker.",
      kind: "destructive",
      errorContext: "Kunne ikke fjerne medlem",
      input: {
        membershipId: z
          .string()
          .min(1)
          .optional()
          .describe("Medlemskapets ID (fra admin-list-households)."),
        ...householdRefArgs,
        ...userRefArgs,
      },
    },
    async ({ membershipId, householdId, householdName, userId, email }) => {
      let id = membershipId;
      if (!id) {
        const resolvedHouseholdId = await resolveHouseholdId(api, {
          householdId,
          householdName,
        });
        const resolvedUserId = await resolveUserId(api, { userId, email });
        const households = await api.admin.listHouseholds.query();
        id = households
          .find((household) => household.id === resolvedHouseholdId)
          ?.members.find((member) => member.user.id === resolvedUserId)?.id;
        if (!id) {
          throw new ToolError(
            "Brukeren er ikke medlem av denne husholdningen.",
          );
        }
      }
      const removed = await api.admin.removeHouseholdMember.mutate({
        membershipId: id,
      });
      return {
        ok: true,
        removed: {
          membershipId: removed.id,
          householdId: removed.householdId,
          userId: removed.userId,
        },
      };
    },
  );
}
