"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "../../lib/trpcClient";
import { Button, Badge } from "@repo/ui";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";
import { X } from "lucide-react";

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
  // High-contrast fall palette for badges (H S L), designed for white text
  const fallBadgePalette = [
    "24 94% 42%",  // amber
    "18 80% 40%",  // pumpkin
    "12 78% 36%",  // rust
    "6 72% 36%",   // brick red
    "30 85% 38%",  // orange
    "40 70% 32%",  // ochre
    "16 68% 34%",  // terracotta
  ];
  // Lock to current week only; backend can handle includeNextWeek
  const currentWeekStart = useMemo(() => new Date().toISOString(), []);
  const activeWeekStart = currentWeekStart;
  const [includeNextWeek, setIncludeNextWeek] = useState(false);
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>({});
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(new Set());

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

  function removeItem(item: ShoppingListItem) {
    const key = `${item.ingredientId}::${item.unit ?? ""}`;
    setRemovedKeys((prev) => new Set(prev).add(key));
    // Mark as checked for all included weeks so it's effectively dismissed
    updateShoppingItem.mutate(
      {
        ingredientId: item.ingredientId,
        unit: item.unit ?? null,
        weeks: item.weekStarts ?? [activeWeekStart],
        checked: true,
      },
      {
        onError: () => {
          setRemovedKeys((prev) => {
            const copy = new Set(prev);
            copy.delete(key);
            return copy;
          });
        },
        onSuccess: () => {
          shoppingQuery.refetch().catch(() => undefined);
        },
      }
    );
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
        <div className="max-w-2xl mx-auto w-full">
          <ul className="space-y-3">
            {sortedItems.map((item) => {
              const key = `${item.ingredientId}::${item.unit ?? ""}`;
              const quantityLabel =
                item.totalQuantity != null ? formatQuantity(item.totalQuantity, item.unit) : null;
              const checked = isChecked(item);
              if (removedKeys.has(key)) return null;
              return (
                <li
                  key={key}
                  className={`border rounded-lg p-3 transition ${checked ? "bg-gray-100 border-gray-200" : "bg-white"
                    }`}
                >
                  <div className={`flex items-center gap-3 ${checked ? "text-gray-400" : ""}`}>
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={checked}
                      onChange={() => toggleItem(item)}
                      aria-label={`Marker ${item.name} som kjøpt`}
                    />
                    <div className="flex-1 min-w-0 flex flex-col gap-2">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <div className={`font-medium ${checked ? "text-gray-500" : "text-gray-900"}`}>{item.name}</div>
                        <div className={`text-xs ${checked ? "text-gray-400" : "text-gray-700"}`}>
                          {quantityLabel ?? "Mengde ikke spesifisert"}
                          {item.hasMissingQuantities && quantityLabel ? " • noen mengder mangler" : null}
                        </div>
                      </div>
                      {item.details.length ? (
                        <div className="flex flex-wrap gap-2 w-full">
                          {item.details.map((detail, index) => {
                            const detailLabel =
                              detail.quantity != null
                                ? formatQuantity(detail.quantity, detail.unit ?? item.unit)
                                : undefined;
                            const hsl = fallBadgePalette[index % fallBadgePalette.length];
                            return (
                              <Badge
                                key={`${detail.recipeId}-${index}`}
                                className={`border-0 text-[11px] font-medium text-white ${checked ? "opacity-70" : ""}`}
                                style={{ backgroundColor: `hsl(${hsl})` }}
                              >
                                {detail.recipeName}
                                {detailLabel ? ` – ${detailLabel}` : ""}
                              </Badge>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-600 shrink-0 self-center"
                      aria-label={`Fjern ${item.name} fra handlelisten`}
                      onClick={() => removeItem(item)}
                      title={`Fjern ${item.name}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
