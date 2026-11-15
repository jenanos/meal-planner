export type PlannedDayKind = "EMPTY" | "RECIPE" | "TAKEAWAY" | "FREEZER";

/**
 * How "Generer ukesplan" treats what the week already holds:
 * - "fill" only fills the empty days;
 * - "refresh" suggests new dinners, but leaves deliberate choices alone:
 *   takeaway, freezer meals and days the user has locked.
 * Either way, days that have passed are never touched.
 */
export type GenerateMode = "fill" | "refresh";

/**
 * The days (0 = Monday) a generation must leave as they are.
 *
 * `todayIndex` is today's position in the week being generated: negative for
 * a week that has not started, above 6 for one that is over. A week that is
 * over has no "passed" days to protect — generating it is a deliberate redo.
 */
export function daysToKeep(
  mode: GenerateMode,
  days: readonly PlannedDayKind[],
  todayIndex: number,
  lockedDays: ReadonlySet<number> = new Set(),
): number[] {
  const firstOpenDay = todayIndex > 6 ? 0 : Math.max(0, todayIndex);
  const keep: number[] = [];
  for (let day = 0; day < 7; day += 1) {
    const kind = days[day] ?? "EMPTY";
    const settled =
      mode === "fill"
        ? kind !== "EMPTY"
        : kind === "TAKEAWAY" ||
          kind === "FREEZER" ||
          (kind === "RECIPE" && lockedDays.has(day));
    if (day < firstOpenDay || settled) keep.push(day);
  }
  return keep;
}
