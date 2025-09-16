"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { trpc } from "../../lib/trpcClient";
import { Button } from "@repo/ui";
import type { Day } from "@repo/api";

const householdId = "00000000-0000-0000-0000-000000000001";
type Targets = Record<"MEAT" | "FISH" | "VEG", number>;

export default function PlannerPage() {
  const [weekStart, setWeekStart] = useState("");
  const [targets, setTargets] = useState<Targets>({ MEAT: 3, FISH: 2, VEG: 2 });
  const [plan, setPlan] = useState<
    | { weekStart: string; items: Array<{ day: Day; recipeId: string | null; title: string; diet: string }> }
    | null
  >(null);

  const generate = trpc.planner.generateWeek.useMutation({
    onSuccess: (data) => setPlan(data.plan),
  });

  const save = trpc.planner.saveWeek.useMutation({
    onSuccess: () => console.log("Plan saved"),
  });

  const canGenerate = !!weekStart && !generate.isPending;
  const canSave = !!plan && !save.isPending;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-center">Planner</h1>

      <div className="flex gap-2 items-end justify-center">
        <div className="flex flex-col">
          <label className="text-sm">Week start</label>
          <input
            type="date"
            className="border px-2 py-1"
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
            required
          />
        </div>

        {(["MEAT", "FISH", "VEG"] as const).map((d) => (
          <div key={d} className="flex flex-col">
            <label className="text-sm">{d}</label>
            <input
              type="number"
              min={0}
              className="border px-2 py-1 w-20"
              value={targets[d]}
              onChange={(e) =>
                setTargets({ ...targets, [d]: parseInt(e.target.value, 10) || 0 })
              }
              required
            />
          </div>
        ))}

        <Button
          onClick={() =>
            generate.mutate({ householdId, weekStart, weeklyTargets: targets })
          }
          disabled={!canGenerate}
        >
          {generate.isPending ? "Generating..." : "Generate"}
        </Button>
      </div>

      {plan && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-center">Weekly plan</h2>
          <div className="flex justify-center">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 max-w-6xl">
              {plan.items.map((i) => (
                <div key={i.day} className="rounded-lg border p-3 shadow-sm bg-white">
                  <div className="text-xs text-gray-500">{i.day}</div>
                  <div className="font-medium">{i.title || "No suggestion"}</div>
                  <div className="text-xs text-gray-400">{i.diet}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-center">
            <Button
              onClick={() =>
                save.mutate({
                  householdId,
                  weekStart,
                  items: plan.items.map((i) => ({ day: i.day, recipeId: i.recipeId })),
                })
              }
              disabled={!canSave}
            >
              {save.isPending ? "Saving..." : "Save plan"}
            </Button>
          </div>
        </div>
      )}

      {(generate.error || save.error) && <p className="text-red-500">Error</p>}
    </div>
  );
}
