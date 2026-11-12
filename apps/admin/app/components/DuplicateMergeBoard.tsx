"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, EyeOff, Pencil, Plus, Search, X } from "lucide-react";

export type MergeItem = {
  id: string;
  name: string;
  usageCount: number;
  unit?: string | null;
};

type Props = {
  /** e.g. { one: "ingrediens", many: "ingredienser" } */
  noun: { one: string; many: string };
  suggestions: MergeItem[][] | undefined;
  allItems: MergeItem[] | undefined;
  isLoading: boolean;
  formatUsage: (count: number) => string;
  onMerge: (keepId: string, mergeIds: string[]) => Promise<unknown>;
  /** localStorage key for suggestions marked as «ikke duplikater». */
  dismissedStorageKey: string;
  /** Warn when the selected items have different units. */
  warnOnUnitMismatch?: boolean;
};

const MANUAL_KEY = "__manual__";
const MAX_SEARCH_RESULTS = 8;

const groupKey = (group: MergeItem[]) =>
  group
    .map((item) => item.id)
    .sort()
    .join(",");

function readDismissed(storageKey: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function writeDismissed(storageKey: string, keys: Set<string>) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(Array.from(keys)));
  } catch {
    // Storage may be unavailable (private mode); dismissals then last for the session.
  }
}

function normalizeSearch(value: string) {
  return value.toLocaleLowerCase("nb").trim();
}

export function DuplicateMergeBoard({
  noun,
  suggestions,
  allItems,
  isLoading,
  formatUsage,
  onMerge,
  dismissedStorageKey,
  warnOnUnitMismatch = false,
}: Props) {
  const manualRef = useRef<HTMLDivElement>(null);

  // Manual selection
  const [query, setQuery] = useState("");
  const [manualIds, setManualIds] = useState<string[]>([]);
  const [manualKeepId, setManualKeepId] = useState<string | null>(null);

  // Suggestion state, keyed by the group's member ids so it survives refetches.
  const [excluded, setExcluded] = useState<Record<string, string[]>>({});
  const [keepByGroup, setKeepByGroup] = useState<Record<string, string>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [showDismissed, setShowDismissed] = useState(false);

  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setDismissed(readDismissed(dismissedStorageKey));
  }, [dismissedStorageKey]);

  const byId = useMemo(() => {
    const map = new Map<string, MergeItem>();
    for (const item of allItems ?? []) map.set(item.id, item);
    for (const group of suggestions ?? []) for (const item of group) map.set(item.id, item);
    return map;
  }, [allItems, suggestions]);

  // Drop manual selections that no longer exist (e.g. merged away).
  useEffect(() => {
    if (!allItems) return;
    setManualIds((prev) => {
      const next = prev.filter((id) => byId.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [allItems, byId]);

  const groups = useMemo(
    () => (suggestions ?? []).map((group) => ({ key: groupKey(group), items: group })),
    [suggestions],
  );
  const visibleGroups = groups.filter((g) => showDismissed || !dismissed.has(g.key));
  const hiddenCount = groups.filter((g) => dismissed.has(g.key)).length;

  const searchResults = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q || !allItems) return [];
    const selected = new Set(manualIds);
    return allItems
      .filter((item) => !selected.has(item.id) && normalizeSearch(item.name).includes(q))
      .sort((a, b) => {
        const aStarts = normalizeSearch(a.name).startsWith(q) ? 0 : 1;
        const bStarts = normalizeSearch(b.name).startsWith(q) ? 0 : 1;
        return aStarts - bStarts || b.usageCount - a.usageCount || a.name.localeCompare(b.name, "nb");
      })
      .slice(0, MAX_SEARCH_RESULTS);
  }, [query, allItems, manualIds]);

  const manualItems = manualIds.map((id) => byId.get(id)).filter((i): i is MergeItem => !!i);
  const effectiveManualKeep =
    manualItems.find((i) => i.id === manualKeepId)?.id ??
    [...manualItems].sort((a, b) => b.usageCount - a.usageCount)[0]?.id ??
    null;

  const addToManual = useCallback((ids: string[], keepId?: string) => {
    setManualIds((prev) => [...prev, ...ids.filter((id) => !prev.includes(id))]);
    if (keepId) setManualKeepId(keepId);
    setNotice(null);
  }, []);

  const runMerge = useCallback(
    async (key: string, keepId: string, ids: string[]) => {
      const mergeIds = ids.filter((id) => id !== keepId);
      const keep = byId.get(keepId);
      if (!keep || mergeIds.length === 0) return;
      const names = mergeIds.map((id) => `«${byId.get(id)?.name ?? "?"}»`).join(", ");
      const ok = window.confirm(
        `Slå sammen ${names} inn i «${keep.name}»?\n\n` +
          `Alt som bruker disse peker deretter til «${keep.name}», og de andre slettes. Dette kan ikke angres.`,
      );
      if (!ok) return;

      setPendingKey(key);
      setError(null);
      setNotice(null);
      try {
        await onMerge(keepId, mergeIds);
        setNotice(
          `Slo sammen ${mergeIds.length} ${mergeIds.length === 1 ? noun.one : noun.many} inn i «${keep.name}».`,
        );
        if (key === MANUAL_KEY) {
          setManualIds([]);
          setManualKeepId(null);
          setQuery("");
        } else {
          const merged = new Set(mergeIds);
          setManualIds((prev) => prev.filter((id) => !merged.has(id)));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sammenslåingen feilet.");
      } finally {
        setPendingKey(null);
      }
    },
    [byId, noun, onMerge],
  );

  const toggleDismissed = (key: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeDismissed(dismissedStorageKey, next);
      return next;
    });
  };

  if (isLoading) {
    return <p className="p-4 text-muted-foreground">Laster duplikatforslag…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {(error || notice) && (
        <div
          role="status"
          className={`rounded-lg border px-3 py-2 text-sm ${
            error
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-primary/40 bg-primary/10 text-card-foreground"
          }`}
        >
          {error ?? notice}
        </div>
      )}

      {/* Manual merge */}
      <section
        ref={manualRef}
        className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card/60 p-3"
      >
        <div>
          <h2 className="text-sm font-semibold text-card-foreground">Slå sammen manuelt</h2>
          <p className="text-xs text-muted-foreground">
            Søk opp {noun.many} – også de som ikke er foreslått – og velg hvilken som skal beholdes.
          </p>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Søk etter ${noun.one}…`}
            className="w-full rounded-lg border border-border/60 bg-background py-2 pl-9 pr-3 text-sm text-card-foreground outline-none focus:border-primary/60"
          />
        </div>

        {query.trim() && (
          <ul className="flex flex-col gap-1">
            {searchResults.length === 0 && (
              <li className="px-1 text-xs text-muted-foreground">Ingen treff.</li>
            )}
            {searchResults.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => addToManual([item.id])}
                  className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border/60 bg-background px-3 py-1.5 text-left text-sm text-card-foreground hover:bg-accent"
                >
                  <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <ItemLabel item={item} />
                  <span className="text-xs text-muted-foreground">{formatUsage(item.usageCount)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {manualItems.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {manualItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                included
                isKept={item.id === effectiveManualKeep}
                formatUsage={formatUsage}
                onKeep={() => setManualKeepId(item.id)}
                trailing={
                  <button
                    type="button"
                    aria-label={`Fjern ${item.name}`}
                    onClick={() => setManualIds((prev) => prev.filter((id) => id !== item.id))}
                    className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-card-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                }
              />
            ))}
            {warnOnUnitMismatch && <UnitWarning items={manualItems} keepId={effectiveManualKeep} byId={byId} />}
            <MergeButton
              count={manualItems.length}
              keepName={effectiveManualKeep ? byId.get(effectiveManualKeep)?.name : undefined}
              pending={pendingKey === MANUAL_KEY}
              disabled={pendingKey !== null}
              onClick={() =>
                effectiveManualKeep && runMerge(MANUAL_KEY, effectiveManualKeep, manualIds)
              }
            />
          </div>
        )}
      </section>

      {/* Suggestions */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {visibleGroups.length === 0 && hiddenCount === 0
              ? `Ingen forslag – alle ${noun.many} ser unike ut.`
              : `${groups.length - hiddenCount} forslag. Huk av det som hører sammen, velg hva som skal beholdes, og slå sammen.`}
          </p>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowDismissed((v) => !v)}
              className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
            >
              {showDismissed ? "Skjul avviste forslag" : `Vis ${hiddenCount} avviste forslag`}
            </button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleGroups.map(({ key, items }) => {
            const excludedIds = new Set(excluded[key] ?? []);
            const included = items.filter((i) => !excludedIds.has(i.id));
            const keepId =
              included.find((i) => i.id === keepByGroup[key])?.id ?? included[0]?.id ?? null;
            const isDismissed = dismissed.has(key);

            const toggleIncluded = (id: string) =>
              setExcluded((prev) => {
                const current = new Set(prev[key] ?? []);
                if (current.has(id)) current.delete(id);
                else current.add(id);
                return { ...prev, [key]: Array.from(current) };
              });

            return (
              <div
                key={key}
                className={`flex flex-col rounded-xl border border-border/50 bg-card/60 ${
                  isDismissed ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
                  <h3 className="truncate text-sm font-semibold text-card-foreground">
                    {items[0]?.name}
                  </h3>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {included.length} av {items.length} valgt
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 p-2">
                  {items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      included={!excludedIds.has(item.id)}
                      isKept={item.id === keepId}
                      formatUsage={formatUsage}
                      onToggle={() => toggleIncluded(item.id)}
                      onKeep={() => {
                        if (excludedIds.has(item.id)) toggleIncluded(item.id);
                        setKeepByGroup((prev) => ({ ...prev, [key]: item.id }));
                      }}
                    />
                  ))}
                  {warnOnUnitMismatch && <UnitWarning items={included} keepId={keepId} byId={byId} />}
                </div>
                <div className="mt-auto flex flex-col gap-2 border-t border-border/40 p-2">
                  <MergeButton
                    count={included.length}
                    keepName={keepId ? byId.get(keepId)?.name : undefined}
                    pending={pendingKey === key}
                    disabled={pendingKey !== null}
                    onClick={() =>
                      keepId && runMerge(key, keepId, included.map((i) => i.id))
                    }
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        addToManual(included.map((i) => i.id), keepId ?? undefined);
                        manualRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-card-foreground hover:bg-accent"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Legg til flere…
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleDismissed(key)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-card-foreground hover:bg-accent"
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                      {isDismissed ? "Vis igjen" : "Ikke duplikater"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ItemLabel({ item, struck = false }: { item: MergeItem; struck?: boolean }) {
  return (
    <span className={`min-w-0 flex-1 truncate ${struck ? "line-through" : ""}`}>
      <span className="font-medium">{item.name}</span>
      {item.unit && <span className="ml-1 text-xs text-muted-foreground">[{item.unit}]</span>}
    </span>
  );
}

function ItemRow({
  item,
  included,
  isKept,
  formatUsage,
  onToggle,
  onKeep,
  trailing,
}: {
  item: MergeItem;
  included: boolean;
  isKept: boolean;
  formatUsage: (count: number) => string;
  onToggle?: () => void;
  onKeep: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm transition-colors ${
        isKept
          ? "border-primary/60 bg-primary/10"
          : included
            ? "border-border/40 bg-background"
            : "border-border/30 bg-background/40"
      }`}
    >
      {onToggle && (
        <input
          type="checkbox"
          checked={included}
          onChange={onToggle}
          aria-label={`Ta med ${item.name}`}
          className="h-4 w-4 shrink-0 cursor-pointer accent-primary"
        />
      )}
      <button
        type="button"
        onClick={onToggle ?? onKeep}
        className={`flex min-w-0 flex-1 items-center gap-2 text-left ${
          included ? "text-card-foreground" : "text-muted-foreground"
        }`}
      >
        <ItemLabel item={item} struck={!included} />
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatUsage(item.usageCount)}
        </span>
      </button>
      <button
        type="button"
        onClick={onKeep}
        aria-pressed={isKept}
        className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ${
          isKept
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border/60 text-muted-foreground hover:bg-accent"
        }`}
      >
        {isKept ? "Beholdes" : "Behold"}
      </button>
      {trailing}
    </div>
  );
}

function UnitWarning({
  items,
  keepId,
  byId,
}: {
  items: MergeItem[];
  keepId: string | null;
  byId: Map<string, MergeItem>;
}) {
  const units = Array.from(new Set(items.map((i) => i.unit ?? "–")));
  if (items.length < 2 || units.length < 2) return null;
  const keep = keepId ? byId.get(keepId) : undefined;
  return (
    <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        Ulike enheter ({units.join(", ")}). Mengder i oppskriftene regnes ikke om
        {keep ? ` – de vil stå i «${keep.unit ?? "ingen enhet"}»` : ""}.
      </span>
    </p>
  );
}

function MergeButton({
  count,
  keepName,
  pending,
  disabled,
  onClick,
}: {
  count: number;
  keepName?: string;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const label =
    count < 2
      ? "Velg minst to"
      : `Slå sammen ${count - 1} inn i «${keepName ?? "?"}»`;
  return (
    <button
      type="button"
      disabled={disabled || count < 2}
      onClick={onClick}
      className="w-full truncate rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
    >
      {pending ? "Slår sammen…" : label}
    </button>
  );
}
