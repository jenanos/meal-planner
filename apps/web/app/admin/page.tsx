"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { Button, Input } from "@repo/ui";
import { Trash2, UserPlus, Shield, ShieldOff } from "lucide-react";
import { trpc } from "../../lib/trpcClient";

// ─── Types for admin queries ───

type AllowedEmailEntry = {
  id: string;
  email: string;
  addedBy: string | null;
  createdAt: Date;
};

type UserEntry = {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
  createdAt: Date;
  memberships: {
    household: { id: string; name: string };
    role: string;
  }[];
};

type HouseholdMemberEntry = {
  id: string;
  role: string;
  user: { id: string; name: string; email: string };
};

type HouseholdEntry = {
  id: string;
  name: string;
  createdAt: Date;
  members: HouseholdMemberEntry[];
};

// ─── Allowed Emails Tab ───

function AllowedEmailsSection() {
  const [newEmail, setNewEmail] = useState("");
  const utils = trpc.useUtils();

  const { data: emails, isLoading } = trpc.admin.listAllowedEmails.useQuery();

  const addEmail = trpc.admin.addAllowedEmail.useMutation({
    onSuccess: () => {
      utils.admin.listAllowedEmails.invalidate();
      setNewEmail("");
    },
  });

  const removeEmail = trpc.admin.removeAllowedEmail.useMutation({
    onSuccess: () => utils.admin.listAllowedEmails.invalidate(),
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Godkjente e-poster</h2>
      <p className="text-sm text-muted-foreground">
        Kun e-poster i denne listen kan logge inn eller registrere seg.
      </p>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newEmail.trim()) return;
          addEmail.mutate({ email: newEmail.trim() });
        }}
      >
        <Input
          type="email"
          placeholder="ny@epost.no"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          className="max-w-xs"
        />
        <Button type="submit" disabled={addEmail.isPending || !newEmail.trim()}>
          <UserPlus className="mr-1.5 h-4 w-4" />
          Legg til
        </Button>
      </form>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Laster…</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {emails?.map((entry: AllowedEmailEntry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between px-4 py-2.5"
            >
              <span className="text-sm">{entry.email}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeEmail.mutate({ id: entry.id })}
                disabled={removeEmail.isPending}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </li>
          ))}
          {emails?.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted-foreground">
              Ingen e-poster lagt til ennå.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// ─── Users Tab ───

function UsersSection() {
  const utils = trpc.useUtils();
  const { data: users, isLoading } = trpc.admin.listUsers.useQuery();

  const updateRole = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => utils.admin.listUsers.invalidate(),
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Brukere</h2>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Laster…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium">Navn</th>
                <th className="px-4 py-2.5 text-left font-medium">E-post</th>
                <th className="px-4 py-2.5 text-left font-medium">Rolle</th>
                <th className="px-4 py-2.5 text-left font-medium">Husholdning</th>
                <th className="px-4 py-2.5 text-right font-medium">Handling</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users?.map((u: UserEntry) => (
                <tr key={u.id}>
                  <td className="px-4 py-2.5">{u.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {u.email}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.role === "ADMIN"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {u.role === "ADMIN" ? (
                        <Shield className="h-3 w-3" />
                      ) : null}
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {u.memberships
                      .map((m: UserEntry["memberships"][number]) => m.household.name)
                      .join(", ") || "–"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        updateRole.mutate({
                          userId: u.id,
                          role: u.role === "ADMIN" ? "USER" : "ADMIN",
                        })
                      }
                      disabled={updateRole.isPending}
                    >
                      {u.role === "ADMIN" ? (
                        <>
                          <ShieldOff className="mr-1 h-3.5 w-3.5" />
                          Fjern admin
                        </>
                      ) : (
                        <>
                          <Shield className="mr-1 h-3.5 w-3.5" />
                          Gjør admin
                        </>
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Households Tab ───

function HouseholdsSection() {
  const [newHouseholdName, setNewHouseholdName] = useState("");
  const [addMemberHousehold, setAddMemberHousehold] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const utils = trpc.useUtils();

  const { data: households, isLoading } = trpc.admin.listHouseholds.useQuery();
  const { data: users } = trpc.admin.listUsers.useQuery();

  const createHousehold = trpc.admin.createHousehold.useMutation({
    onSuccess: () => {
      utils.admin.listHouseholds.invalidate();
      setNewHouseholdName("");
    },
  });

  const addMember = trpc.admin.addHouseholdMember.useMutation({
    onSuccess: () => {
      utils.admin.listHouseholds.invalidate();
      setAddMemberHousehold(null);
      setSelectedUserId("");
    },
  });

  const removeMember = trpc.admin.removeHouseholdMember.useMutation({
    onSuccess: () => utils.admin.listHouseholds.invalidate(),
  });

  const deleteHousehold = trpc.admin.deleteHousehold.useMutation({
    onSuccess: () => utils.admin.listHouseholds.invalidate(),
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Husholdninger</h2>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newHouseholdName.trim()) return;
          createHousehold.mutate({ name: newHouseholdName.trim() });
        }}
      >
        <Input
          placeholder="Navn på ny husholdning"
          value={newHouseholdName}
          onChange={(e) => setNewHouseholdName(e.target.value)}
          className="max-w-xs"
        />
        <Button
          type="submit"
          disabled={createHousehold.isPending || !newHouseholdName.trim()}
        >
          Opprett
        </Button>
      </form>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Laster…</p>
      ) : (
        <div className="space-y-4">
          {households?.map((h: HouseholdEntry) => (
            <div key={h.id} className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{h.name}</h3>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setAddMemberHousehold(
                        addMemberHousehold === h.id ? null : h.id,
                      )
                    }
                  >
                    <UserPlus className="mr-1 h-3.5 w-3.5" />
                    Legg til medlem
                  </Button>
                  {h.members.length === 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        deleteHousehold.mutate({ householdId: h.id })
                      }
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  )}
                </div>
              </div>

              {addMemberHousehold === h.id && (
                <div className="mt-2 flex gap-2">
                  <select
                    className="rounded-md border px-3 py-1.5 text-sm"
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                  >
                    <option value="">Velg bruker…</option>
                    {users
                      ?.filter(
                        (u: UserEntry) =>
                          !h.members.some((m: HouseholdMemberEntry) => m.user.id === u.id),
                      )
                      .map((u: UserEntry) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </option>
                      ))}
                  </select>
                  <Button
                    size="sm"
                    disabled={!selectedUserId || addMember.isPending}
                    onClick={() =>
                      addMember.mutate({
                        householdId: h.id,
                        userId: selectedUserId,
                      })
                    }
                  >
                    Legg til
                  </Button>
                </div>
              )}

              <ul className="mt-2 divide-y rounded-md border">
                {h.members.map((m: HouseholdMemberEntry) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between px-3 py-2"
                  >
                    <div className="text-sm">
                      <span className="font-medium">{m.user.name}</span>{" "}
                      <span className="text-muted-foreground">
                        ({m.user.email})
                      </span>{" "}
                      <span className="text-xs text-muted-foreground">
                        [{m.role}]
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        removeMember.mutate({ membershipId: m.id })
                      }
                      disabled={removeMember.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </li>
                ))}
                {h.members.length === 0 && (
                  <li className="px-3 py-2 text-sm text-muted-foreground">
                    Ingen medlemmer.
                  </li>
                )}
              </ul>
            </div>
          ))}
          {households?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Ingen husholdninger ennå.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Admin Page ───

type Tab = "emails" | "users" | "households";

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("emails");

  const tabs: { id: Tab; label: string }[] = [
    { id: "emails", label: "Godkjente e-poster" },
    { id: "users", label: "Brukere" },
    { id: "households", label: "Husholdninger" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Administrasjon</h1>

      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "emails" && <AllowedEmailsSection />}
      {tab === "users" && <UsersSection />}
      {tab === "households" && <HouseholdsSection />}
    </div>
  );
}
