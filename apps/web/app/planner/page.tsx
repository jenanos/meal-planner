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
      <h1 className="text-xl font-bold">Planner</h1>

      <div className="flex gap-2 items-end">
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
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Generated plan</h2>
          <ul className="list-disc pl-6">
            {plan.items.map((i) => (
              <li key={i.day}>
                {i.day}: {i.title} ({i.diet})
              </li>
            ))}
          </ul>
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
      )}

      {(generate.error || save.error) && <p className="text-red-500">Error</p>}
    </div>
  );
}
