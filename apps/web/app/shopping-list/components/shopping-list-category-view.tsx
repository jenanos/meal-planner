"use client";

import { Button } from "@repo/ui";
import { X } from "lucide-react";

export interface ShoppingListCategoryEntry {
  key: string;
  name: string;
  quantityLabel: string;
  extraInfo?: string;
  checked: boolean;
  onToggle: () => void;
  onRemove: () => void;
}

export interface ShoppingListCategorySection {
  key: string;
  label: string;
  entries: ShoppingListCategoryEntry[];
}

interface ShoppingListCategoryViewProps {
  sections: ShoppingListCategorySection[];
  emptyText?: string;
}

export function ShoppingListCategoryView({
  sections,
  emptyText,
}: ShoppingListCategoryViewProps) {
  const visibleSections = sections.filter((section) => section.entries.length > 0);
  if (!visibleSections.length) {
    return (
      <p className="text-sm text-gray-500">
        {emptyText ?? "Ingen ingredienser for valgte dager."}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {visibleSections.map((section) => (
        <section key={section.key} className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">{section.label}</h3>
          <ul className="space-y-3">
            {section.entries.map((entry) => (
              <li
                key={entry.key}
                className={`border rounded-lg p-3 bg-white ${entry.checked ? "opacity-75" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5"
                    checked={entry.checked}
                    onChange={entry.onToggle}
                    aria-label={`Marker ${entry.name} som kjøpt`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <div
                        className={`font-medium ${entry.checked ? "text-gray-500" : "text-gray-900"}`}
                      >
                        {entry.name}
                      </div>
                      <div
                        className={`text-xs ${entry.checked ? "text-gray-400" : "text-gray-700"}`}
                      >
                        {entry.quantityLabel}
                        {entry.extraInfo ?? ""}
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-600 shrink-0 self-center"
                    aria-label={`Fjern ${entry.name} fra handlelisten`}
                    onClick={entry.onRemove}
                    title={`Fjern ${entry.name}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
