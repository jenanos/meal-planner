"use client";

import React from "react";
import { trpc } from "../../lib/trpcClient";
import { DuplicateMergeBoard } from "./DuplicateMergeBoard";

const formatUsage = (count: number) => `${count} oppskrift${count === 1 ? "" : "er"}`;

export function IngredientsDuplicateBoard() {
  const utils = trpc.useUtils();
  const suggestions = trpc.ingredient.listPotentialDuplicates.useQuery();
  const all = trpc.ingredient.list.useQuery();
  const mergeMutation = trpc.ingredient.merge.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.ingredient.listPotentialDuplicates.invalidate(),
        utils.ingredient.list.invalidate(),
        utils.ingredient.listWithoutUnit.invalidate(),
      ]);
    },
  });

  return (
    <DuplicateMergeBoard
      noun={{ one: "ingrediens", many: "ingredienser" }}
      suggestions={suggestions.data}
      allItems={all.data}
      isLoading={suggestions.isLoading}
      formatUsage={formatUsage}
      onMerge={(keepId, mergeIds) => mergeMutation.mutateAsync({ keepId, mergeIds })}
      overlapWarning={(keep) =>
        `Står flere av dem i samme oppskrift, beholdes bare linjen for «${keep}» – mengde og notat på de andre linjene forsvinner.`
      }
      dismissedStorageKey="admin:dismissed-duplicates:ingredients"
      warnOnUnitMismatch
    />
  );
}
