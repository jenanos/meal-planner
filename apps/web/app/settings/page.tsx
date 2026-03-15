"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
} from "@repo/ui";
import { GripVertical, LogOut, X } from "lucide-react";
import { trpc } from "../../lib/trpcClient";
import { signOut } from "../../lib/auth-client";
import { useAuth } from "../components/AuthGuard";
import {
  DEFAULT_VISIBLE_DAY_INDICES,
  STANDARD_STORE_CATEGORY_ORDER,
  ingredientCategoryLabel,
  normalizeCategoryOrder,
  type ShoppingViewMode,
} from "../../lib/shopping";
import { ALL_DAY_NAMES } from "../planner/utils";

type ShoppingStore = {
  id: string;
  name: string;
  categoryOrder: string[];
  isDefault: boolean;
};

type UserSettings = {
  defaultViewMode: ShoppingViewMode;
  startDay: number;
  includeNextWeek: boolean;
  showPantryWithIngredients: boolean;
  visibleDayIndices: number[];
  defaultStoreId: string | null;
};

function SortableCategoryItem({ category }: { category: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: category });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`flex items-center gap-3 rounded-md border bg-white px-3 py-2 ${
        isDragging ? "shadow-md" : ""
      }`}
    >
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground"
        aria-label={`Flytt ${ingredientCategoryLabel(category)}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="text-sm">{ingredientCategoryLabel(category)}</span>
    </li>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings>({
    defaultViewMode: "by-day",
    startDay: 0,
    includeNextWeek: false,
    showPantryWithIngredients: false,
    visibleDayIndices: [...DEFAULT_VISIBLE_DAY_INDICES],
    defaultStoreId: null,
  });
  const [stores, setStores] = useState<ShoppingStore[]>([]);
  const [isStoreModalOpen, setIsStoreModalOpen] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreOrder, setNewStoreOrder] = useState<string[]>([
    ...STANDARD_STORE_CATEGORY_ORDER,
  ]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const settingsQuery = trpc.planner.shoppingSettings.useQuery(
    undefined,
    { staleTime: 30_000 },
  );
  const updateSettingsMutation =
    trpc.planner.updateShoppingSettings.useMutation();
  const createStoreMutation = trpc.planner.createShoppingStore.useMutation();

  useEffect(() => {
    const data = settingsQuery.data as
      | {
          settings: UserSettings;
          stores: ShoppingStore[];
        }
      | undefined;
    if (!data) return;

    const nextStores = (data.stores ?? []).map((store) => ({
      ...store,
      categoryOrder: normalizeCategoryOrder(store.categoryOrder),
    }));
    setStores(nextStores);

    const s = data.settings;
    setSettings({
      ...s,
      visibleDayIndices: Array.from(
        new Set(s.visibleDayIndices),
      ).sort((a, b) => a - b),
    });
  }, [settingsQuery.data]);

  useEffect(() => {
    if (isStoreModalOpen) {
      setNewStoreOrder([...STANDARD_STORE_CATEGORY_ORDER]);
      setNewStoreName("");
    }
  }, [isStoreModalOpen]);

  const defaultStoreId =
    settings.defaultStoreId ??
    stores.find((store) => store.isDefault)?.id ??
    stores[0]?.id ??
    null;

  function patchSettings(patch: Partial<UserSettings>) {
    setSettings((prev) => ({ ...prev, ...patch }));
  }

  function toggleVisibleDay(dayIndex: number) {
    const set = new Set(settings.visibleDayIndices);
    if (set.has(dayIndex)) {
      if (set.size <= 1) return;
      set.delete(dayIndex);
    } else {
      set.add(dayIndex);
    }
    patchSettings({
      visibleDayIndices: Array.from(set).sort((a, b) => a - b),
    });
  }

  async function saveSettings() {
    await updateSettingsMutation.mutateAsync({
      defaultViewMode: settings.defaultViewMode,
      startDay: settings.startDay,
      includeNextWeek: settings.includeNextWeek,
      showPantryWithIngredients: settings.showPantryWithIngredients,
      visibleDayIndices: settings.visibleDayIndices,
      defaultStoreId:
        settings.defaultStoreId ??
        stores.find((store) => store.isDefault)?.id ??
        null,
    } as any);
    settingsQuery.refetch().catch(() => undefined);
  }

  function handleStoreDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = newStoreOrder.indexOf(String(active.id));
    const newIndex = newStoreOrder.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    setNewStoreOrder((prev) => arrayMove(prev, oldIndex, newIndex));
  }

  async function createStore() {
    const name = newStoreName.trim();
    if (!name) return;
    await createStoreMutation.mutateAsync({
      name,
      categoryOrder: newStoreOrder,
    } as any);
    setIsStoreModalOpen(false);
    settingsQuery.refetch().catch(() => undefined);
  }

  async function handleSignOut() {
    await signOut();
    if (typeof globalThis !== "undefined" && "location" in globalThis) {
      (globalThis as any).location.href = "/login";
    }
  }

  const isBusy =
    settingsQuery.isLoading ||
    updateSettingsMutation.isPending;

  const currentStore = useMemo(
    () => stores.find((store) => store.id === defaultStoreId) ?? null,
    [stores, defaultStoreId],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="hidden text-xl font-bold text-center md:block">Innstillinger</h1>

      {/* User profile section */}
      <section className="rounded-2xl border border-sky-200/60 bg-sky-50/40 p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Bruker</h2>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {user?.image ? (
              <img // eslint-disable-line @next/next/no-img-element
                src={user.image}
                alt=""
                className="h-10 w-10 rounded-full"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-200 text-sky-700 font-bold">
                {(user?.name ?? "?").charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-sm font-medium">{user?.name ?? "Ukjent"}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
          >
            <LogOut className="mr-1.5 h-3.5 w-3.5" />
            Logg ut
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-orange-200/60 bg-orange-50/40 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Handleliste-innstillinger
          </h2>
          {currentStore ? (
            <Badge variant="secondary" className="text-[11px]">
              {currentStore.name}
            </Badge>
          ) : null}
        </div>

        <div className="space-y-2">
          <h3 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">
            Visning
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "by-day", label: "Ukesplan" },
              { id: "alphabetical", label: "Alfabetisk" },
              { id: "by-category", label: "Kategorier" },
            ].map((option) => (
              <Button
                key={option.id}
                type="button"
                variant={
                  settings.defaultViewMode === option.id
                    ? "default"
                    : "outline"
                }
                size="sm"
                onClick={() =>
                  patchSettings({
                    defaultViewMode: option.id as ShoppingViewMode,
                  })
                }
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">
            Startuke på
          </h3>
          <div className="grid grid-cols-7 gap-1">
            {ALL_DAY_NAMES.map((name, index) => (
              <Button
                key={name}
                type="button"
                size="sm"
                variant={settings.startDay === index ? "default" : "outline"}
                className="h-7 px-0 text-[10px] w-full"
                onClick={() => patchSettings({ startDay: index })}
              >
                {name.slice(0, 3)}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">
            Innstillinger
          </h3>
          <div className="space-y-2">
            <label className="flex items-center justify-between border rounded-lg p-2.5 cursor-pointer hover:bg-accent">
              <span className="text-sm">Inkluder neste uke</span>
              <Checkbox
                checked={settings.includeNextWeek}
                onCheckedChange={(checked) =>
                  patchSettings({ includeNextWeek: Boolean(checked) })
                }
              />
            </label>
            <label className="flex items-center justify-between border rounded-lg p-2.5 cursor-pointer hover:bg-accent">
              <span className="text-sm">Vis basisvarer med ingredienser</span>
              <Checkbox
                checked={settings.showPantryWithIngredients}
                onCheckedChange={(checked) =>
                  patchSettings({
                    showPantryWithIngredients: Boolean(checked),
                  })
                }
              />
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">
            Velg dager
          </h3>
          <div className="grid grid-cols-7 gap-1">
            {ALL_DAY_NAMES.map((name, index) => {
              const selected = settings.visibleDayIndices.includes(index);
              return (
                <Button
                  key={name}
                  type="button"
                  size="sm"
                  variant={selected ? "default" : "outline"}
                  className="h-7 px-0 text-[10px] w-full"
                  onClick={() => toggleVisibleDay(index)}
                >
                  {name.slice(0, 3)}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">
            Butikk
          </h3>
          <select
            value={defaultStoreId ?? stores[0]?.id}
            onChange={(event) =>
              patchSettings({ defaultStoreId: event.target.value })
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end">
          <Button type="button" onClick={saveSettings} disabled={isBusy}>
            Lagre innstillinger
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-200/60 bg-emerald-50/40 p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Butikker</h2>
          <Dialog open={isStoreModalOpen} onOpenChange={setIsStoreModalOpen}>
            <DialogTrigger asChild>
              <Button type="button" size="sm">
                Ny butikk
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <div className="flex items-center justify-between gap-2">
                  <DialogTitle>Legg til butikk</DialogTitle>
                  <DialogClose asChild>
                    <Button type="button" variant="ghost" size="icon" aria-label="Lukk">
                      <X className="h-4 w-4" />
                    </Button>
                  </DialogClose>
                </div>
                <DialogDescription>
                  Start med standardbutikk og dra kategoriene i ønsket rekkefølge.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-sm">Butikknavn</label>
                  <Input
                    value={newStoreName}
                    onChange={(event) => setNewStoreName(event.target.value)}
                    placeholder="F.eks. Rema 1000"
                  />
                </div>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleStoreDragEnd}
                >
                  <SortableContext
                    items={newStoreOrder}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul className="space-y-2">
                      {newStoreOrder.map((category) => (
                        <SortableCategoryItem key={category} category={category} />
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
                <Button
                  type="button"
                  className="w-full"
                  onClick={createStore}
                  disabled={createStoreMutation.isPending || !newStoreName.trim()}
                >
                  Lagre butikk
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-3">
          {stores.map((store) => (
            <div key={store.id} className="rounded-lg border bg-white p-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">{store.name}</span>
                {store.isDefault ? (
                  <Badge variant="outline" className="text-[11px]">
                    Standard
                  </Badge>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {normalizeCategoryOrder(store.categoryOrder)
                  .map((category) => ingredientCategoryLabel(category))
                  .join(" → ")}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
