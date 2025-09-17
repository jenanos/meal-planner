"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "../../lib/trpcClient";
import { Button } from "@repo/ui";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";

type GenOutput = inferRouterOutputs<AppRouter>["planner"]["generateWeekPlan"];
type RecipeDTO = GenOutput["alternatives"][number];

// week: Array<RecipeDTO | null>

function mondayOf(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0-6, 0=søn
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default function PlannerPage() {
  const [weekStartISO, setWeekStartISO] = useState(mondayOf());

  const gen = trpc.planner.generateWeekPlan.useMutation();
  const sugg = trpc.planner.suggestions.useQuery({ excludeIds: [] });
  const save = trpc.planner.saveWeekPlan.useMutation();

  const [week, setWeek] = useState<Array<any>>(Array(7).fill(null));
  const alternatives = useMemo(() => sugg.data ?? [], [sugg.data]);

  useEffect(() => {
    gen.mutate(undefined, {
      onSuccess: (res) => {
        const days = res.days ?? [];
        setWeek(days.map((d: any) => d?.recipe ?? null));
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSave = week.every((r) => r && r.id);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-center">Weekly planner</h1>

      <div className="flex gap-3 justify-center items-end">
        <div className="flex flex-col">
          <label className="text-sm">Week start (Mon)</label>
          <input
            type="date"
            className="border px-2 py-1"
            value={new Date(weekStartISO).toISOString().slice(0, 10)}
            onChange={(e) => setWeekStartISO(new Date(e.target.value).toISOString())}
          />
        </div>
        <Button onClick={() => gen.mutate(undefined, {
          onSuccess: (res) => setWeek(res.days.map((d: any) => d.recipe))
        })}>
          Generate
        </Button>
      </div>

      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 gap-3 min-w-[840px]">
          {week.map((r, idx) => (
            <div key={idx} className="border rounded p-3 bg-white">
              <div className="text-xs text-gray-500">Day {idx}</div>
              <div className="font-medium">{r?.name ?? "—"}</div>
              <div className="text-xs text-gray-500">{r?.category}</div>
              <div className="text-xs text-gray-400">E{r?.everydayScore} • H{r?.healthScore}</div>
              {r?.ingredients?.length ? (
                <ul className="list-disc pl-5 text-xs mt-1">
                  {r.ingredients.map((i: any) => <li key={i.ingredientId}>{i.name}</li>)}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold">Alternatives</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {alternatives.map((r: any) => (
            <button
              key={r.id}
              className="text-left border rounded p-2 hover:bg-gray-50"
              onClick={() => {
                // sett første tomme dag til denne
                const i = week.findIndex((x) => !x);
                if (i >= 0) {
                  const next = [...week];
                  next[i] = r;
                  setWeek(next);
                }
              }}
            >
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-gray-500">{r.category} • E{r.everydayScore} • H{r.healthScore}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-center">
        <Button
          disabled={!canSave || save.isPending}
          onClick={() => save.mutate({
            weekStart: weekStartISO,
            recipeIdsByDay: week.map((r) => r.id),
          })}
        >
          {save.isPending ? "Saving…" : "Save week plan"}
        </Button>
      </div>

      {(gen.error || save.error) && <p className="text-red-500 text-center">Error</p>}
    </div>
  );
}
