"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "../../lib/trpcClient";
import { Button } from "@repo/ui";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";

const MS_PER_DAY = 86_400_000;

function startOfWeekISO(dateInput?: string | Date) {
  const date = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date value");
  }
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  utc.setUTCDate(utc.getUTCDate() + diff);
  utc.setUTCHours(0, 0, 0, 0);
  return utc.toISOString();
}

function addWeeksISO(weekStartISO: string, weeks: number) {
  const date = new Date(weekStartISO);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return startOfWeekISO(date);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatWeekRange(weekStartISO: string) {
  const formatter = new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "short",
  });

  const start = new Date(weekStartISO);
  const end = addDays(new Date(weekStartISO), 6);
  return `${formatter.format(start)}–${formatter.format(end)}`;
}

function deriveWeekLabel(weekStartISO: string, currentWeekISO: string) {
  const diffWeeks = Math.round(
    (new Date(weekStartISO).getTime() - new Date(currentWeekISO).getTime()) /
      (7 * MS_PER_DAY)
  );

  let prefix = "Denne uken";
  if (diffWeeks === 1) prefix = "Neste uke";
  else if (diffWeeks === -1) prefix = "Forrige uke";
  else if (diffWeeks >= 2) prefix = "Kommende";
  else if (diffWeeks <= -2) prefix = "Tidligere";

  return `${prefix} (${formatWeekRange(weekStartISO)})`;
}

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
  const currentWeekStart = useMemo(() => startOfWeekISO(), []);
  const [activeWeekStart, setActiveWeekStart] = useState(currentWeekStart);
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

  const weekLabel = useMemo(
    () => deriveWeekLabel(activeWeekStart, currentWeekStart),
    [activeWeekStart, currentWeekStart]
  );

  const diffWeeks = useMemo(
    () =>
      Math.round(
        (new Date(activeWeekStart).getTime() - new Date(currentWeekStart).getTime()) /
          (7 * MS_PER_DAY)
      ),
    [activeWeekStart, currentWeekStart]
  );

  const maxAhead = includeNextWeek ? 3 : 4;
  const canGoPrev = diffWeeks > -4;
  const canGoNext = diffWeeks < maxAhead;

  const includedWeekLabels = useMemo(() => {
    const weeks = shoppingQuery.data?.includedWeekStarts ?? (shoppingQuery.data?.weekStart ? [shoppingQuery.data.weekStart] : []);
    return weeks.map((week) => deriveWeekLabel(week, currentWeekStart));
  }, [shoppingQuery.data?.includedWeekStarts, shoppingQuery.data?.weekStart, currentWeekStart]);

  function changeWeek(delta: number) {
    const target = addWeeksISO(activeWeekStart, delta);
    const offset = Math.round(
      (new Date(target).getTime() - new Date(currentWeekStart).getTime()) / (7 * MS_PER_DAY)
    );
    if (offset < -4 || offset > 4) return;
    if (includeNextWeek && offset + 1 > 4) return;
    setActiveWeekStart(target);
  }

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
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => changeWeek(-1)} disabled={!canGoPrev}>
            Forrige uke
          </Button>
          <div className="text-sm font-medium text-gray-700">{weekLabel}</div>
          <Button type="button" variant="outline" size="sm" onClick={() => changeWeek(1)} disabled={!canGoNext}>
            Neste uke
          </Button>
        </div>
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
        <p className="text-xs text-gray-500">
          Viser varer for {includedWeekLabels.join(" og ")}.
        </p>
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
                className={`border rounded-lg p-3 transition ${
                  checked ? "bg-gray-100 border-gray-200" : "bg-white"
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
