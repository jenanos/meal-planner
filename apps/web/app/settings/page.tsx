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
import { GripVertical, X } from "lucide-react";
import { trpc } from "../../lib/trpcClient";
import { getOrCreateDeviceId } from "../../lib/device-id";
import {
  DEFAULT_VISIBLE_DAY_INDICES,
  STANDARD_STORE_CATEGORY_ORDER,
  ingredientCategoryLabel,
  normalizeCategoryOrder,
  shoppingRoleLabel,
  type ShoppingUserRole,
  type ShoppingViewMode,
} from "../../lib/shopping";
import { ALL_DAY_NAMES } from "../planner/utils";

type ShoppingStore = {
  id: string;
  name: string;
  categoryOrder: string[];
  isDefault: boolean;
};

type RoleSettings = {
  role: ShoppingUserRole;
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
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<ShoppingUserRole>("JENS");
  const [roleSettingsByRole, setRoleSettingsByRole] = useState<
    Record<ShoppingUserRole, RoleSettings>
  >({
    INGVILD: {
      role: "INGVILD",
      defaultViewMode: "by-day",
      startDay: 0,
      includeNextWeek: false,
      showPantryWithIngredients: false,
      visibleDayIndices: [...DEFAULT_VISIBLE_DAY_INDICES],
      defaultStoreId: null,
    },
    JENS: {
      role: "JENS",
      defaultViewMode: "by-day",
      startDay: 0,
      includeNextWeek: false,
      showPantryWithIngredients: false,
      visibleDayIndices: [...DEFAULT_VISIBLE_DAY_INDICES],
      defaultStoreId: null,
    },
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

  useEffect(() => {
    setDeviceId(getOrCreateDeviceId());
  }, []);

  const settingsQuery = trpc.planner.shoppingSettings.useQuery(
    { deviceId: deviceId ?? "" } as any,
    { enabled: Boolean(deviceId), staleTime: 30_000 },
  );
  const setRoleMutation = trpc.planner.setShoppingDeviceRole.useMutation();
  const updateRoleSettingsMutation =
    trpc.planner.updateShoppingRoleSettings.useMutation();
  const createStoreMutation = trpc.planner.createShoppingStore.useMutation();

  useEffect(() => {
    const data = settingsQuery.data as
      | {
        activeRole: ShoppingUserRole;
        stores: ShoppingStore[];
        roles: RoleSettings[];
      }
      | undefined;
    if (!data) return;

    const nextStores = (data.stores ?? []).map((store) => ({
      ...store,
      categoryOrder: normalizeCategoryOrder(store.categoryOrder),
    }));
    setStores(nextStores);
    setSelectedRole(data.activeRole ?? "JENS");

    setRoleSettingsByRole((prev) => {
      const next = { ...prev };
      for (const roleSettings of data.roles ?? []) {
        next[roleSettings.role] = {
          ...roleSettings,
          visibleDayIndices: Array.from(
            new Set(roleSettings.visibleDayIndices),
          ).sort((a, b) => a - b),
        };
      }
      return next;
    });
  }, [settingsQuery.data]);

  useEffect(() => {
    if (isStoreModalOpen) {
      setNewStoreOrder([...STANDARD_STORE_CATEGORY_ORDER]);
      setNewStoreName("");
    }
  }, [isStoreModalOpen]);

  const selectedRoleSettings = roleSettingsByRole[selectedRole];
  const defaultStoreId =
    selectedRoleSettings.defaultStoreId ??
    stores.find((store) => store.isDefault)?.id ??
    stores[0]?.id ??
    null;

  async function handleSelectRole(role: ShoppingUserRole) {
    if (!deviceId) return;
    setSelectedRole(role);
    await setRoleMutation.mutateAsync({ deviceId, role } as any);
    settingsQuery.refetch().catch(() => undefined);
  }

  function patchSelectedRoleSettings(patch: Partial<RoleSettings>) {
    setRoleSettingsByRole((prev) => ({
      ...prev,
      [selectedRole]: {
        ...prev[selectedRole],
        ...patch,
      },
    }));
  }

  function toggleVisibleDay(dayIndex: number) {
    const set = new Set(selectedRoleSettings.visibleDayIndices);
    if (set.has(dayIndex)) {
      if (set.size <= 1) return;
      set.delete(dayIndex);
    } else {
      set.add(dayIndex);
    }
    patchSelectedRoleSettings({
      visibleDayIndices: Array.from(set).sort((a, b) => a - b),
    });
  }

  async function saveRoleSettings() {
    const payload = roleSettingsByRole[selectedRole];
    await updateRoleSettingsMutation.mutateAsync({
      role: selectedRole,
      defaultViewMode: payload.defaultViewMode,
      startDay: payload.startDay,
      includeNextWeek: payload.includeNextWeek,
      showPantryWithIngredients: payload.showPantryWithIngredients,
      visibleDayIndices: payload.visibleDayIndices,
      defaultStoreId:
        payload.defaultStoreId ??
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

  const isBusy =
    settingsQuery.isLoading ||
    setRoleMutation.isPending ||
    updateRoleSettingsMutation.isPending;

  const currentStore = useMemo(
    () => stores.find((store) => store.id === defaultStoreId) ?? null,
    [stores, defaultStoreId],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="hidden text-xl font-bold text-center md:block">Innstillinger</h1>

      {!deviceId ? (
        <p className="text-sm text-muted-foreground">Klargjør enhets-ID…</p>
      ) : null}

      <section className="rounded-2xl border border-sky-200/60 bg-sky-50/40 p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Hvem bruker denne enheten?</h2>
          {deviceId ? (
            <span className="text-[11px] text-muted-foreground">
              Enhet: {deviceId.slice(0, 8)}
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(["INGVILD", "JENS"] as const).map((role) => (
            <Button
              key={role}
              type="button"
              variant={selectedRole === role ? "default" : "outline"}
              onClick={() => handleSelectRole(role)}
              disabled={!deviceId || setRoleMutation.isPending}
            >
              {shoppingRoleLabel(role)}
            </Button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-orange-200/60 bg-orange-50/40 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Default handleliste for {shoppingRoleLabel(selectedRole)}
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
                  selectedRoleSettings.defaultViewMode === option.id
                    ? "default"
                    : "outline"
                }
                size="sm"
                onClick={() =>
                  patchSelectedRoleSettings({
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
                variant={selectedRoleSettings.startDay === index ? "default" : "outline"}
                className="h-7 px-0 text-[10px] w-full"
                onClick={() => patchSelectedRoleSettings({ startDay: index })}
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
                checked={selectedRoleSettings.includeNextWeek}
                onCheckedChange={(checked) =>
                  patchSelectedRoleSettings({ includeNextWeek: Boolean(checked) })
                }
              />
            </label>
            <label className="flex items-center justify-between border rounded-lg p-2.5 cursor-pointer hover:bg-accent">
              <span className="text-sm">Vis basisvarer med ingredienser</span>
              <Checkbox
                checked={selectedRoleSettings.showPantryWithIngredients}
                onCheckedChange={(checked) =>
                  patchSelectedRoleSettings({
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
              const selected = selectedRoleSettings.visibleDayIndices.includes(index);
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
              patchSelectedRoleSettings({ defaultStoreId: event.target.value })
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
          <Button type="button" onClick={saveRoleSettings} disabled={isBusy}>
            Lagre default-innstillinger
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
