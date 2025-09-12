"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { trpc } from "../../lib/trpcClient";
import { Button } from "@repo/ui/components/Button";

const householdId = "00000000-0000-0000-0000-000000000001";

export default function PlannerPage() {
  const [weekStart, setWeekStart] = useState("");
  const [targets, setTargets] = useState({ MEAT: 3, FISH: 2, VEG: 2 });
  const [plan, setPlan] = useState<
    | { weekStart: string; items: Array<{ day: string; recipeId: string | null; title: string; diet: string }> }
    | null
  >(null);

  const generate = useMutation({
    mutationFn: () =>
      trpc.planner.generateWeek.mutate({
        householdId,
        weekStart,
        weeklyTargets: targets,
      }),
    onSuccess: (data) => setPlan(data.plan),
  });

  const save = useMutation({
    mutationFn: () =>
      trpc.planner.saveWeek.mutate({
        householdId,
        weekStart,
        items: plan!.items.map((i) => ({ day: i.day, recipeId: i.recipeId })),
      }),
    onSuccess: () => alert("Plan saved"),
  });

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">Planner</h1>
      <div className="flex gap-2">
        <input
          type="date"
          className="border px-2 py-1"
          value={weekStart}
          onChange={(e) => setWeekStart(e.target.value)}
          required
        />
        {(["MEAT", "FISH", "VEG"] as const).map((d) => (
          <input
            key={d}
            type="number"
            className="border px-2 py-1 w-16"
            value={targets[d]}
            onChange={(e) =>
              setTargets({ ...targets, [d]: parseInt(e.target.value, 10) })
            }
            required
          />
        ))}
        <Button onClick={() => generate.mutate()}>Generate</Button>
      </div>

      {plan && (
        <div className="space-y-2">
          <ul className="list-disc pl-4">
            {plan.items.map((i) => (
              <li key={i.day}>
                {i.day}: {i.title} ({i.diet})
              </li>
            ))}
          </ul>
          <Button onClick={() => save.mutate()}>Save plan</Button>
        </div>
      )}
      {(generate.error || save.error) && (
        <p className="text-red-500">Error</p>
      )}
    </div>
  );
}

