"use client";

import React, { useCallback, useState } from "react";
import { trpc } from "../../lib/trpcClient";

type DuplicateItem = {
  id: string;
  name: string;
  usageCount: number;
  category: string | null;
};

type DuplicateGroup = DuplicateItem[];

export function ExtraItemsDuplicateBoard() {
  const utils = trpc.useUtils();
  const { data, isLoading } =
    trpc.planner.extraCatalogListPotentialDuplicates.useQuery();
  const mergeMutation = trpc.planner.extraCatalogMerge.useMutation({
    onSuccess: () => {
      utils.planner.extraCatalogListPotentialDuplicates.invalidate();
      utils.planner.extraCatalogList.invalidate();
      utils.planner.extraSuggest.invalidate();
    },
  });

  const [selectedKeep, setSelectedKeep] = useState<Record<number, string>>({});

  const handleSelectKeep = useCallback(
    (groupIndex: number, itemId: string) => {
      setSelectedKeep((prev) => ({ ...prev, [groupIndex]: itemId }));
    },
    [],
  );

  const handleMerge = useCallback(
    (groupIndex: number, group: DuplicateGroup) => {
      const keepId = selectedKeep[groupIndex] ?? group[0].id;
      const mergeIds = group
        .filter((item) => item.id !== keepId)
        .map((item) => item.id);
      if (mergeIds.length === 0) return;
      mergeMutation.mutate({ keepId, mergeIds });
    },
    [selectedKeep, mergeMutation],
  );

  if (isLoading) {
    return (
      <p className="p-4 text-muted-foreground">Laster duplikatgrupper…</p>
    );
  }

  const groups: DuplicateGroup[] = (data as DuplicateGroup[]) ?? [];

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/60 p-8 text-center">
        <p className="text-lg font-medium text-card-foreground">
          ✅ Ingen duplikater funnet
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Alle egne elementer ser unike ut.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {groups.length} gruppe{groups.length !== 1 ? "r" : ""} med mulige
        duplikater. Velg elementet du vil beholde, og klikk «Slå sammen».
      </p>
      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group, groupIndex) => {
          const keepId = selectedKeep[groupIndex] ?? group[0].id;
          return (
            <div
              key={group.map((i) => i.id).join("-")}
              className="flex flex-col rounded-xl border border-border/50 bg-card/60"
            >
              <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
                <h3 className="text-sm font-semibold text-card-foreground">
                  Gruppe {groupIndex + 1}
                </h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {group.length} elementer
                </span>
              </div>
              <div className="flex flex-col gap-1.5 p-2">
                {group.map((item) => {
                  const isKept = item.id === keepId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectKeep(groupIndex, item.id)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        isKept
                          ? "border-primary/60 bg-primary/10 text-primary"
                          : "border-border/40 bg-background text-card-foreground hover:bg-accent"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                          isKept
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/40"
                        }`}
                      >
                        {isKept && (
                          <svg width="10" height="10" viewBox="0 0 10 10">
                            <circle cx="5" cy="5" r="3" fill="currentColor" />
                          </svg>
                        )}
                      </span>
                      <span className="flex-1 font-medium">{item.name}</span>
                      <span className="text-xs text-muted-foreground">
                        brukt {item.usageCount}x
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-border/40 p-2">
                <button
                  type="button"
                  disabled={mergeMutation.isPending}
                  onClick={() => handleMerge(groupIndex, group)}
                  className="w-full rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {mergeMutation.isPending ? "Slår sammen…" : "Slå sammen"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
