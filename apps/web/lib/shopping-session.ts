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
  visibleDayKeys: string[];
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

function sanitizeDayKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    if (seen.has(entry)) continue;
    seen.add(entry);
    unique.push(entry);
  }
  return unique;
}

function clearStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function readShoppingSession(): ShoppingSessionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession> | null;
    if (!parsed || typeof parsed !== "object") {
      clearStorage();
      return null;
    }

    const savedAt = Number(parsed.savedAt);
    if (!Number.isFinite(savedAt)) {
      clearStorage();
      return null;
    }
    if (Date.now() - savedAt > SHOPPING_SESSION_TTL_MS) {
      clearStorage();
      return null;
    }

    if (!isViewMode(parsed.viewMode)) {
      clearStorage();
      return null;
    }
    if (!isDisplayStyle(parsed.displayStyle)) {
      clearStorage();
      return null;
    }

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
      visibleDayKeys: sanitizeDayKeys(parsed.visibleDayKeys),
      selectedStoreId:
        typeof parsed.selectedStoreId === "string" ? parsed.selectedStoreId : null,
    };
  } catch {
    clearStorage();
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
  clearStorage();
}
