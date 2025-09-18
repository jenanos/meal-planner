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
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>({});

  const shoppingQuery = trpc.planner.shoppingList.useQuery({ weekStart: activeWeekStart });

  useEffect(() => {
    setCheckedMap({});
  }, [shoppingQuery.data?.weekStart]);

  const items = shoppingQuery.data?.items ?? [];
  const isLoading = shoppingQuery.isLoading;
  const isFetching = shoppingQuery.isFetching;

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

  const canGoPrev = diffWeeks > -4;
  const canGoNext = diffWeeks < 4;

  function changeWeek(delta: number) {
    const target = addWeeksISO(activeWeekStart, delta);
    const offset = Math.round(
      (new Date(target).getTime() - new Date(currentWeekStart).getTime()) / (7 * MS_PER_DAY)
    );
    if (offset < -4 || offset > 4) return;
    setActiveWeekStart(target);
  }

  function toggleItem(item: ShoppingListItem) {
    const key = `${item.ingredientId}::${item.unit ?? ""}`;
    setCheckedMap((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
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
        {isFetching && <span className="text-xs text-gray-500">Oppdaterer…</span>}
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Laster handleliste…</p>
      ) : !items.length ? (
        <p className="text-sm text-gray-500">Ingen oppskrifter valgt for denne uken ennå.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const key = `${item.ingredientId}::${item.unit ?? ""}`;
            const quantityLabel =
              item.totalQuantity != null ? formatQuantity(item.totalQuantity, item.unit) : null;
            return (
              <li key={key} className="border rounded-lg p-3 bg-white">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={isChecked(item)}
                    onChange={() => toggleItem(item)}
                  />
                  <div className="flex-1 space-y-1">
                    <div className="font-medium text-gray-900">{item.name}</div>
                    <div className="text-xs text-gray-500">
                      {quantityLabel ?? "Mengde ikke spesifisert"}
                      {item.hasMissingQuantities && quantityLabel ? " • noen mengder mangler" : null}
                    </div>
                    {item.details.length ? (
                      <ul className="list-disc pl-5 text-xs text-gray-500 space-y-1">
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

