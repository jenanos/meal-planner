const DEVICE_ID_STORAGE_KEY = "meal-planner.device-id";

function randomDeviceId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getOrCreateDeviceId() {
  if (typeof window === "undefined") return null;
  const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing && existing.trim()) {
    return existing.trim();
  }
  const next = randomDeviceId();
  window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, next);
  return next;
}

