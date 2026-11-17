// The small note on a week-plan card that says who changed the day by hand
// and when, so a deliberate choice is not mistaken for a generated one.

export type DayChangeKind =
  | "ADDED"
  | "REPLACED"
  | "MOVED"
  | "MOVED_OUT"
  | "REMOVED";

export type DayChange = {
  kind: DayChangeKind;
  otherDayIndex: number | null;
  changedAt: string;
  changedBy: { id: string; name: string } | null;
};

const DAY_NAMES = [
  "mandag",
  "tirsdag",
  "onsdag",
  "torsdag",
  "fredag",
  "lørdag",
  "søndag",
];

const MS_PER_DAY = 86_400_000;

function describeKind(change: DayChange): string {
  const other =
    change.otherDayIndex != null ? DAY_NAMES[change.otherDayIndex] : undefined;
  switch (change.kind) {
    case "ADDED":
      return "Lagt til";
    case "REPLACED":
      return "Endret";
    case "MOVED":
      return other ? `Flyttet fra ${other}` : "Flyttet";
    case "MOVED_OUT":
      return other ? `Flyttet til ${other}` : "Flyttet";
    case "REMOVED":
      return "Fjernet";
  }
}

function describeWho(
  changedBy: DayChange["changedBy"],
  currentUserId: string | null | undefined,
): string {
  if (!changedBy) return "en tidligere bruker";
  if (currentUserId && changedBy.id === currentUserId) return "deg";
  // First name keeps the note short; fall back to the whole name.
  const first = changedBy.name.trim().split(/\s+/)[0];
  return first || changedBy.name || "ukjent";
}

const pad = (value: number) => String(value).padStart(2, "0");

/** "i dag 14:32", "i går 09:05", "tirsdag 18:10" or "03.11. 18:10". */
export function describeWhen(changedAt: Date, now: Date): string {
  const time = `${pad(changedAt.getHours())}:${pad(changedAt.getMinutes())}`;
  const startOf = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const daysAgo = Math.round((startOf(now) - startOf(changedAt)) / MS_PER_DAY);
  if (daysAgo <= 0) return `i dag ${time}`;
  if (daysAgo === 1) return `i går ${time}`;
  if (daysAgo < 7) {
    // getDay(): 0 = Sunday.
    return `${DAY_NAMES[(changedAt.getDay() + 6) % 7]} ${time}`;
  }
  return `${pad(changedAt.getDate())}.${pad(changedAt.getMonth() + 1)}. ${time}`;
}

/** E.g. "Flyttet fra mandag av Kari · i går 18:10". */
export function describeDayChange(
  change: DayChange,
  options: { currentUserId?: string | null; now?: Date } = {},
): string {
  const now = options.now ?? new Date();
  return `${describeKind(change)} av ${describeWho(
    change.changedBy,
    options.currentUserId,
  )} · ${describeWhen(new Date(change.changedAt), now)}`;
}
