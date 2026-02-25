"use client";

import { Button } from "@repo/ui";
import { X } from "lucide-react";
import type { ShoppingListItem, ShoppingListOccurrence } from "../types";
import { formatQuantity } from "../utils";

export interface ShoppingListCategoryEntry {
  item: ShoppingListItem;
  quantity: number | null;
  hasMissingQuantities: boolean;
  checked: boolean;
  occurrences: ShoppingListOccurrence[];
}

export interface ShoppingListCategorySection {
  key: string;
  label: string;
  entries: ShoppingListCategoryEntry[];
}

interface ShoppingListCategoryViewProps {
  sections: ShoppingListCategorySection[];
  removedKeys: Set<string>;
  onToggleEntry: (
    item: ShoppingListItem,
    occurrences: ShoppingListOccurrence[],
  ) => void;
  onRemoveItem: (_item: ShoppingListItem) => void;
}

export function ShoppingListCategoryView({
  sections,
  removedKeys,
  onToggleEntry,
  onRemoveItem,
}: ShoppingListCategoryViewProps) {
  const visibleSections = sections.filter((section) => section.entries.length > 0);
  if (!visibleSections.length) {
    return <p className="text-sm text-gray-500">Ingen ingredienser for valgte dager.</p>;
  }

  return (
    <div className="space-y-6">
      {visibleSections.map((section) => (
        <section key={section.key} className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">{section.label}</h3>
          <ul className="space-y-3">
            {section.entries.map((entry) => {
              const { item } = entry;
              const key = `${item.ingredientId}::${item.unit ?? ""}`;
              if (removedKeys.has(key)) return null;

              const quantityLabel =
                entry.quantity != null
                  ? formatQuantity(entry.quantity, item.unit ?? null)
                  : "Mengde ikke spesifisert";
              const extraInfo =
                entry.hasMissingQuantities && entry.quantity != null
                  ? " • noen mengder mangler"
                  : "";

              return (
                <li
                  key={key}
                  className={`border rounded-lg p-3 bg-white ${entry.checked ? "opacity-75" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5"
                      checked={entry.checked}
                      onChange={() => onToggleEntry(item, entry.occurrences)}
                      aria-label={`Marker ${item.name} som kjøpt`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <div
                          className={`font-medium ${entry.checked ? "text-gray-500" : "text-gray-900"}`}
                        >
                          {item.name}
                        </div>
                        <div
                          className={`text-xs ${entry.checked ? "text-gray-400" : "text-gray-700"}`}
                        >
                          {quantityLabel}
                          {extraInfo}
                        </div>
                      </div>
                    </div>
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
        </section>
      ))}
    </div>
  );
}

