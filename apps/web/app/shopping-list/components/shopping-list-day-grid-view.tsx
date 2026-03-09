"use client";

import { ShoppingListGridItem } from "./shopping-list-grid-item";
import { formatQuantity } from "../utils";
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

interface ShoppingListDayGridViewProps {
  sections: ShoppingListDaySection[];
  getOccurrenceKey: (
    _item: ShoppingListItem,
    _occurrence: ShoppingListOccurrence,
  ) => string;
  isOccurrenceChecked: (
    _item: ShoppingListItem,
    _occurrence: ShoppingListOccurrence,
  ) => boolean;
  onToggleOccurrence: (
    _item: ShoppingListItem,
    _occurrence: ShoppingListOccurrence,
  ) => void;
  onRemoveItem: (_item: ShoppingListItem) => void;
  removedKeys: Set<string>;
}

export function ShoppingListDayGridView({
  sections,
  getOccurrenceKey,
  isOccurrenceChecked,
  onToggleOccurrence,
  onRemoveItem,
  removedKeys,
}: ShoppingListDayGridViewProps) {
  if (!sections.length) {
    return <p className="text-sm text-gray-500">Ingen dager valgt.</p>;
  }

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <div key={section.key} className="space-y-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-xs font-semibold text-gray-900">
              {section.recipeNames.length > 0
                ? section.recipeNames.join(", ")
                : section.weekdayLabel}
            </span>
            <span className="text-[10px] font-normal text-muted-foreground">
              {section.longLabel}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {section.entries.map(({ item, occurrence }) => {
              const removalKey = `${item.ingredientId}::${item.unit ?? ""}`;
              if (removedKeys.has(removalKey)) return null;

              const checked = isOccurrenceChecked(item, occurrence);
              const occurrenceKey = getOccurrenceKey(item, occurrence);
              const quantityLabel =
                occurrence.quantity != null
                  ? formatQuantity(
                      occurrence.quantity,
                      item.unit,
                    )
                  : item.totalQuantity != null
                    ? formatQuantity(item.totalQuantity, item.unit)
                    : null;

              return (
                <ShoppingListGridItem
                  key={occurrenceKey}
                  name={item.name}
                  quantityLabel={quantityLabel}
                  checked={checked}
                  onToggle={() => onToggleOccurrence(item, occurrence)}
                  onRemove={() => onRemoveItem(item)}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
