"use client";

import React from "react";
import { trpc } from "../../lib/trpcClient";
import { DuplicateMergeBoard } from "./DuplicateMergeBoard";

const formatUsage = (count: number) => `brukt ${count}x`;

export function ExtraItemsDuplicateBoard() {
  const utils = trpc.useUtils();
  const suggestions = trpc.planner.extraCatalogListPotentialDuplicates.useQuery();
  const all = trpc.planner.extraCatalogList.useQuery();
  const mergeMutation = trpc.planner.extraCatalogMerge.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.planner.extraCatalogListPotentialDuplicates.invalidate(),
        utils.planner.extraCatalogList.invalidate(),
        utils.planner.extraSuggest.invalidate(),
      ]);
    },
  });

  return (
    <DuplicateMergeBoard
      noun={{ one: "element", many: "elementer" }}
      suggestions={suggestions.data}
      allItems={all.data}
      isLoading={suggestions.isLoading}
      formatUsage={formatUsage}
      onMerge={(keepId, mergeIds) => mergeMutation.mutateAsync({ keepId, mergeIds })}
      dismissedStorageKey="admin:dismissed-duplicates:extra-items"
    />
  );
}
