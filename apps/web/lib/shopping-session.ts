import {
  SHOPPING_DISPLAY_STYLES,
  SHOPPING_VIEW_MODES,
  type ShoppingDisplayStyle,
  type ShoppingViewMode,
} from "./shopping";

const STORAGE_KEY = "meal-planner.shopping-list.session";
export const SHOPPING_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type ShoppingSessionState = {
  viewMode: ShoppingViewMode;
  displayStyle: ShoppingDisplayStyle;
  startDay: number;
  includeNextWeek: boolean;
  showPantryWithIngredients: boolean;
  visibleDayIndices: number[];
  selectedStoreId: string | null;
};

type StoredSession = ShoppingSessionState & { savedAt: number };

function isViewMode(value: unknown): value is ShoppingViewMode {
  return (
    typeof value === "string" &&
    (SHOPPING_VIEW_MODES as readonly string[]).includes(value)
  );
}

function isDisplayStyle(value: unknown): value is ShoppingDisplayStyle {
  return (
    typeof value === "string" &&
    (SHOPPING_DISPLAY_STYLES as readonly string[]).includes(value)
  );
}

function sanitizeDayIndices(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<number>();
  for (const entry of value) {
    const n = Number(entry);
    if (Number.isInteger(n) && n >= 0 && n <= 6) unique.add(n);
  }
  return Array.from(unique).sort((a, b) => a - b);
}

export function readShoppingSession(): ShoppingSessionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession> | null;
    if (!parsed || typeof parsed !== "object") return null;

    const savedAt = Number(parsed.savedAt);
    if (!Number.isFinite(savedAt)) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (Date.now() - savedAt > SHOPPING_SESSION_TTL_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    if (!isViewMode(parsed.viewMode)) return null;
    if (!isDisplayStyle(parsed.displayStyle)) return null;

    const startDay = Math.min(
      6,
      Math.max(0, Number.isInteger(parsed.startDay) ? Number(parsed.startDay) : 0),
    );

    return {
      viewMode: parsed.viewMode,
      displayStyle: parsed.displayStyle,
      startDay,
      includeNextWeek: Boolean(parsed.includeNextWeek),
      showPantryWithIngredients: Boolean(parsed.showPantryWithIngredients),
      visibleDayIndices: sanitizeDayIndices(parsed.visibleDayIndices),
      selectedStoreId:
        typeof parsed.selectedStoreId === "string" ? parsed.selectedStoreId : null,
    };
  } catch {
    return null;
  }
}

export function writeShoppingSession(state: ShoppingSessionState) {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredSession = { ...state, savedAt: Date.now() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota errors etc.
  }
}

export function clearShoppingSession() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}
