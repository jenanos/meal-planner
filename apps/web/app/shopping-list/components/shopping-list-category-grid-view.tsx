"use client";

import { ShoppingListGridItem } from "./shopping-list-grid-item";
import type { ShoppingListCategorySection } from "./shopping-list-category-view";

interface ShoppingListCategoryGridViewProps {
  sections: ShoppingListCategorySection[];
  emptyText?: string;
}

export function ShoppingListCategoryGridView({
  sections,
  emptyText,
}: ShoppingListCategoryGridViewProps) {
  const visibleSections = sections.filter(
    (section) => section.entries.length > 0,
  );
  if (!visibleSections.length) {
    return (
      <p className="text-sm text-gray-500">
        {emptyText ?? "Ingen ingredienser for valgte dager."}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {visibleSections.map((section) => (
        <section key={section.key} className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-900">
            {section.label}
          </h3>
          <div className="grid grid-cols-4 gap-1.5">
            {section.entries.map((entry) => (
              <ShoppingListGridItem
                key={entry.key}
                name={entry.name}
                quantityLabel={entry.quantityLabel}
                checked={entry.checked}
                onToggle={entry.onToggle}
                onRemove={entry.onRemove}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
