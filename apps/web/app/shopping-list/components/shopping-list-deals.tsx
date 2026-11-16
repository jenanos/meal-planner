"use client";

import { Button } from "@repo/ui";
import { Tag, X } from "lucide-react";

export interface ShoppingDeal {
  store: string;
  price: string;
  regularPrice: string | null;
  product: string | null;
  /** YYYY-MM-DD */
  validFrom: string | null;
  /** YYYY-MM-DD, the last day the offer applies. */
  validTo: string;
  addedByDeal: boolean;
}

export interface ShoppingDealEntry {
  id: string;
  name: string;
  checked: boolean;
  deal: ShoppingDeal;
}

const dayFormatter = new Intl.DateTimeFormat("nb-NO", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const formatDay = (dateOnly: string) =>
  dayFormatter.format(new Date(`${dateOnly}T00:00:00.000Z`));

/** Today's calendar date where the user is, as YYYY-MM-DD. */
function localToday(now: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function describeDealPeriod(
  deal: Pick<ShoppingDeal, "validFrom" | "validTo">,
  now: Date = new Date(),
) {
  const today = localToday(now);
  if (deal.validFrom && deal.validFrom > today) {
    return `${formatDay(deal.validFrom)} – ${formatDay(deal.validTo)}`;
  }
  if (deal.validTo === today) return "siste dag i dag";
  return `t.o.m. ${formatDay(deal.validTo)}`;
}

interface ShoppingListDealsProps {
  entries: ShoppingDealEntry[];
  compact?: boolean;
  onToggle: (name: string, checked: boolean) => void;
  onRemove: (name: string) => void;
}

/**
 * Items that are on the list because a store has them on offer. They are
 * kept apart from the rest so it is obvious why they are there, and each
 * one says where, for how much and until when.
 */
export function ShoppingListDeals({
  entries,
  compact,
  onToggle,
  onRemove,
}: ShoppingListDealsProps) {
  if (!entries.length) return null;
  const sorted = [...entries].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    // The offer that ends first is the one to act on first.
    return (
      a.deal.validTo.localeCompare(b.deal.validTo) ||
      a.name.localeCompare(b.name, "nb", { sensitivity: "base" })
    );
  });

  return (
    <section
      aria-label="Tilbud"
      className={
        compact
          ? undefined
          : "rounded-2xl border border-amber-300/70 bg-amber-50/60 p-4"
      }
    >
      {compact ? null : (
        <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
          <Tag className="h-4 w-4 text-amber-700" aria-hidden />
          Tilbud
        </h2>
      )}
      <ul className={compact ? "space-y-2" : "space-y-3"}>
        {sorted.map((entry) => {
          const { deal } = entry;
          const details = [
            deal.product,
            deal.regularPrice ? `før ${deal.regularPrice}` : null,
          ].filter(Boolean);
          return (
            <li
              key={entry.id}
              className={`rounded-lg border border-amber-300 bg-white p-3 ${entry.checked ? "opacity-60" : ""}`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5"
                  checked={entry.checked}
                  onChange={() => onToggle(entry.name, entry.checked)}
                  aria-label={`Marker ${entry.name} som ${entry.checked ? "ikke kjøpt" : "kjøpt"}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`font-medium ${entry.checked ? "text-gray-500 line-through" : "text-gray-900"}`}
                    >
                      {entry.name}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                      <Tag className="h-3 w-3" aria-hidden />
                      Tilbud
                    </span>
                  </div>
                  <div className="mt-0.5 text-sm text-gray-900">
                    <span className="font-semibold">{deal.store}</span>
                    {" · "}
                    <span className="font-semibold text-amber-800">
                      {deal.price}
                    </span>
                    {" · "}
                    <span className="whitespace-nowrap text-gray-600">
                      {describeDealPeriod(deal)}
                    </span>
                  </div>
                  {details.length ? (
                    <div className="mt-0.5 text-xs text-gray-500">
                      {details.join(" · ")}
                    </div>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-600 shrink-0 self-center"
                  onClick={() => onRemove(entry.name)}
                  aria-label={`Fjern ${entry.name} fra handlelisten`}
                  title={`Fjern ${entry.name}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
