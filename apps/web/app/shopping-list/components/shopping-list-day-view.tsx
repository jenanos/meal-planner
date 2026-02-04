"use client";

import { Badge, Button } from "@repo/ui";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useState } from "react";
import { formatQuantity, FALL_BADGE_PALETTE } from "../utils";
import type { ShoppingListItem, ShoppingListOccurrence } from "../types";

export interface ShoppingListDaySection {
  key: string;
  weekdayLabel: ShoppingListOccurrence["weekdayLabel"];
  longLabel: ShoppingListOccurrence["longLabel"];
  recipeNames: string[];
  entries: Array<{
    item: ShoppingListItem;
    occurrence: ShoppingListOccurrence;
  }>;
}

interface ShoppingListDayViewProps {
  sections: ShoppingListDaySection[];
  getOccurrenceKey: (_item: ShoppingListItem, _occurrence: ShoppingListOccurrence) => string;
  isOccurrenceChecked: (_item: ShoppingListItem, _occurrence: ShoppingListOccurrence) => boolean;
  getFirstCheckedOccurrence: (
    _item: ShoppingListItem,
    _occurrence: ShoppingListOccurrence
  ) => ShoppingListOccurrence | null;
  onToggleOccurrence: (_item: ShoppingListItem, _occurrence: ShoppingListOccurrence) => void;
  onRemoveItem: (_item: ShoppingListItem) => void;
  removedKeys: Set<string>;
}

export function ShoppingListDayView({
  sections,
  getOccurrenceKey,
  isOccurrenceChecked,
  getFirstCheckedOccurrence,
  onToggleOccurrence,
  onRemoveItem,
  removedKeys,
}: ShoppingListDayViewProps) {
  const [expandedDetailsKeys, setExpandedDetailsKeys] = useState<Set<string>>(new Set());

  const toggleDetails = (key: string) => {
    setExpandedDetailsKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (!sections.length) {
    return <p className="text-sm text-gray-500">Ingen dager valgt.</p>;
  }

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section.key} className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-semibold text-gray-900">
              {section.recipeNames.length > 0
                ? section.recipeNames.join(", ")
                : section.weekdayLabel}
            </span>
            <span className="text-xs font-normal text-muted-foreground">{section.longLabel}</span>
          </div>
          <ul className="space-y-3">
            {section.entries.map(({ item, occurrence }) => {
              const removalKey = `${item.ingredientId}::${item.unit ?? ""}`;
              if (removedKeys.has(removalKey)) return null;

              const checked = isOccurrenceChecked(item, occurrence);
              const quantityLabel =
                occurrence.quantity != null && item.unit !== null
                  ? formatQuantity(occurrence.quantity, item.unit)
                  : occurrence.quantity != null
                    ? formatQuantity(occurrence.quantity, null)
                    : null;
              const totalQuantityLabel =
                item.totalQuantity != null && item.unit !== null
                  ? formatQuantity(item.totalQuantity, item.unit)
                  : item.totalQuantity != null
                    ? formatQuantity(item.totalQuantity, null)
                    : null;

              const infoParts: string[] = [];
              if (quantityLabel) {
                infoParts.push(quantityLabel);
              } else if (totalQuantityLabel) {
                infoParts.push(totalQuantityLabel);
              } else {
                infoParts.push("Mengde ikke spesifisert");
              }

              if (occurrence.hasMissingQuantities && quantityLabel) {
                infoParts.push("noen mengder mangler");
              } else if (!quantityLabel && item.hasMissingQuantities) {
                infoParts.push("noen mengder mangler");
              }

              if (
                quantityLabel &&
                totalQuantityLabel &&
                occurrence.quantity != null &&
                item.totalQuantity != null &&
                Math.abs(item.totalQuantity - occurrence.quantity) > 1e-9
              ) {
                infoParts.push(`totalt ${totalQuantityLabel}`);
              }

              const firstChecked = getFirstCheckedOccurrence(item, occurrence);
              const purchasedHint = firstChecked
                ? `Kjøpt for ${firstChecked.weekdayLabel.toLowerCase()} - sjekk at vi har nok av dette`
                : null;
              const occurrenceKey = getOccurrenceKey(item, occurrence);
              const showDetailsToggle = item.details.length > 0;
              const isExpanded = expandedDetailsKeys.has(occurrenceKey);
              const detailBadges = item.details.map((detail, index) => {
                const detailLabel =
                  detail.quantity != null ? formatQuantity(detail.quantity, detail.unit ?? item.unit) : undefined;
                const hsl = FALL_BADGE_PALETTE[index % FALL_BADGE_PALETTE.length];
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
              });

              return (
                <li key={occurrenceKey} className={`border rounded-lg p-3 bg-white ${checked ? "opacity-75" : ""}`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5"
                      checked={checked}
                      onChange={() => onToggleOccurrence(item, occurrence)}
                      aria-label={`Marker ${item.name} som kjøpt for ${occurrence.weekdayLabel}`}
                    />
                    <div className="flex-1 min-w-0 flex flex-col gap-2">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <div className={`font-medium ${checked ? "text-gray-500" : "text-gray-900"}`}>{item.name}</div>
                        <div className={`text-xs ${checked ? "text-gray-400" : "text-gray-700"}`}>
                          {infoParts.join(" • ")}
                        </div>
                      </div>
                      {purchasedHint ? (
                        <div className="text-xs text-emerald-600">{purchasedHint}</div>
                      ) : null}
                      {item.details.length ? (
                        <>
                          <div className="hidden md:flex flex-wrap gap-2 w-full">{detailBadges}</div>
                          {isExpanded ? (
                            <div className="flex md:hidden flex-wrap gap-2 w-full">{detailBadges}</div>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                    {showDetailsToggle ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="md:hidden text-gray-500 shrink-0 self-center"
                        aria-label={
                          isExpanded
                            ? `Skjul detaljer for ${item.name} i handlelisten`
                            : `Vis detaljer for ${item.name} i handlelisten`
                        }
                        onClick={() => toggleDetails(occurrenceKey)}
                        title={isExpanded ? "Skjul detaljer" : "Vis detaljer"}
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-600 shrink-0 self-center"
                      aria-label={`Fjern ${item.name} fra handlelisten`}
                      onClick={() => onRemoveItem(item)}
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
      ))}
    </div>
  );
}
