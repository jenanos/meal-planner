"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "../../lib/trpcClient";
import { Button } from "@repo/ui";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";

function formatQuantity(quantity: number, unit: string | null) {
  const formatter = new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: 2,
    minimumFractionDigits: quantity % 1 === 0 ? 0 : 1,
  });
  const formatted = formatter.format(quantity);
  return unit ? `${formatted} ${unit}` : formatted;
}

type PlannerOutputs = inferRouterOutputs<AppRouter>["planner"];
type ShoppingListResult = PlannerOutputs["shoppingList"];
type ShoppingListItem = ShoppingListResult["items"][number];

export default function ShoppingListPage() {
  // Lock to current week only; backend can handle includeNextWeek
  const currentWeekStart = useMemo(() => new Date().toISOString(), []);
  const activeWeekStart = currentWeekStart;
  const [includeNextWeek, setIncludeNextWeek] = useState(false);
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>({});

  const shoppingQuery = trpc.planner.shoppingList.useQuery({
    weekStart: activeWeekStart,
    includeNextWeek,
  });

  const includedWeeksSignature = useMemo(
    () => (shoppingQuery.data?.includedWeekStarts ?? (shoppingQuery.data?.weekStart ? [shoppingQuery.data.weekStart] : [])).join("|"),
    [shoppingQuery.data?.includedWeekStarts, shoppingQuery.data?.weekStart]
  );

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const item of shoppingQuery.data?.items ?? []) {
      const key = `${item.ingredientId}::${item.unit ?? ""}`;
      next[key] = item.checked ?? false;
    }
    setCheckedMap(next);
  }, [includedWeeksSignature, shoppingQuery.data?.items]);

  const items = shoppingQuery.data?.items ?? [];
  const isLoading = shoppingQuery.isLoading;
  const isFetching = shoppingQuery.isFetching;

  const sortedItems = useMemo(() => {
    const unchecked: ShoppingListItem[] = [];
    const checked: ShoppingListItem[] = [];
    for (const item of items) {
      const key = `${item.ingredientId}::${item.unit ?? ""}`;
      if (checkedMap[key]) checked.push(item);
      else unchecked.push(item);
    }
    return [...unchecked, ...checked];
  }, [items, checkedMap]);

  const includedWeekLabels = useMemo(() => {
    const weeks = shoppingQuery.data?.includedWeekStarts ?? (shoppingQuery.data?.weekStart ? [shoppingQuery.data.weekStart] : []);
    return weeks;
  }, [shoppingQuery.data?.includedWeekStarts, shoppingQuery.data?.weekStart]);

  const updateShoppingItem = trpc.planner.updateShoppingItem.useMutation();

  function toggleItem(item: ShoppingListItem) {
    const key = `${item.ingredientId}::${item.unit ?? ""}`;
    const currentValue = checkedMap[key] ?? item.checked ?? false;
    const nextValue = !currentValue;
    setCheckedMap((prev) => ({
      ...prev,
      [key]: nextValue,
    }));
    updateShoppingItem.mutate(
      {
        ingredientId: item.ingredientId,
        unit: item.unit ?? null,
        weeks: item.weekStarts ?? [activeWeekStart],
        checked: nextValue,
      },
      {
        onError: () => {
          setCheckedMap((prev) => ({
            ...prev,
            [key]: currentValue,
          }));
        },
        onSuccess: () => {
          shoppingQuery.refetch().catch(() => undefined);
        },
      }
    );
  }

  function isChecked(item: ShoppingListItem) {
    const key = `${item.ingredientId}::${item.unit ?? ""}`;
    return Boolean(checkedMap[key]);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-center sm:text-left">Handleliste</h1>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant={includeNextWeek ? "default" : "outline"}
            size="sm"
            onClick={() => setIncludeNextWeek((prev) => !prev)}
            aria-pressed={includeNextWeek}
          >
            {includeNextWeek ? "Fjern neste ukes plan" : "Inkluder neste ukes plan"}
          </Button>
          {isFetching && <span className="text-xs text-gray-500">Oppdaterer…</span>}
        </div>
      </div>

      {includeNextWeek && includedWeekLabels.length ? (
        <p className="text-xs text-gray-500">Viser varer for {includedWeekLabels.join(" og ")}.</p>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-gray-500">Laster handleliste…</p>
      ) : !sortedItems.length ? (
        <p className="text-sm text-gray-500">Ingen oppskrifter valgt for denne uken ennå.</p>
      ) : (
        <ul className="space-y-3">
          {sortedItems.map((item) => {
            const key = `${item.ingredientId}::${item.unit ?? ""}`;
            const quantityLabel =
              item.totalQuantity != null ? formatQuantity(item.totalQuantity, item.unit) : null;
            const checked = isChecked(item);
            return (
              <li
                key={key}
                className={`border rounded-lg p-3 transition ${checked ? "bg-gray-100 border-gray-200" : "bg-white"
                  }`}
              >
                <label className={`flex items-start gap-3 cursor-pointer ${checked ? "text-gray-400" : ""}`}>
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={isChecked(item)}
                    onChange={() => toggleItem(item)}
                  />
                  <div className="flex-1 space-y-1">
                    <div className={`font-medium ${checked ? "text-gray-500" : "text-gray-900"}`}>{item.name}</div>
                    <div className={`text-xs ${checked ? "text-gray-400" : "text-gray-500"}`}>
                      {quantityLabel ?? "Mengde ikke spesifisert"}
                      {item.hasMissingQuantities && quantityLabel ? " • noen mengder mangler" : null}
                    </div>
                    {item.details.length ? (
                      <ul className={`list-disc pl-5 text-xs space-y-1 ${checked ? "text-gray-400" : "text-gray-500"}`}>
                        {item.details.map((detail, index) => {
                          const detailLabel =
                            detail.quantity != null
                              ? formatQuantity(detail.quantity, detail.unit ?? item.unit)
                              : undefined;
                          return (
                            <li key={`${detail.recipeId}-${index}`}>
                              {detail.recipeName}
                              {detailLabel ? ` – ${detailLabel}` : ""}
                              {detail.notes ? ` (${detail.notes})` : ""}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
