// Central palettes for planner UI
// HSL strings without the hsl() wrapper; consumed as CSS custom property --magic-card-bg

import type { DayName } from "./types";

export const DAY_ORDER: DayName[] = [
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
  "Søndag",
];

export function getDayByIndex(index: number): DayName {
  return DAY_ORDER[((index % 7) + 7) % 7];
}

// Slightly tuned fall palette: a touch more saturation on early week, softer on weekend
export const dayBaseHsl: Record<DayName, string> = {
  Mandag: "38 88% 93%",   // warm sand-yellow
  Tirsdag: "34 82% 91%",  // cream
  Onsdag: "28 78% 89%",   // soft orange
  Torsdag: "24 74% 87%",  // apricot
  Fredag: "20 70% 86%",   // peach
  Lørdag: "16 66% 85%",   // light terracotta
  Søndag: "10 62% 85%",   // gentle red-tint
};

// Hover gradients per day – mixing amber/green/brown/red with a bit more contrast
export const dayHoverGradients: Record<DayName, { from: string; to: string; color: string }> = {
  Mandag: { from: "#F59E0B", to: "#65A30D", color: "#F59E0B" },
  Tirsdag: { from: "#FB923C", to: "#16A34A", color: "#EA580C" },
  Onsdag: { from: "#16A34A", to: "#92400E", color: "#16A34A" },
  Torsdag: { from: "#92400E", to: "#DC2626", color: "#B45309" },
  Fredag: { from: "#DC2626", to: "#7C2D12", color: "#DC2626" },
  Lørdag: { from: "#B45309", to: "#16A34A", color: "#92400E" },
  Søndag: { from: "#B91C1C", to: "#F59E0B", color: "#B91C1C" },
};

// Suggestion palettes; a notch more separation and calm search tones
export const suggestionPalettes = {
  frequent: [
    "34 80% 92%",
    "30 76% 90%",
    "26 72% 88%",
  ],
  longGap: [
    "16 70% 90%",
    "12 66% 88%",
    "8 62% 86%",
  ],
  search: [
    "40 28% 95%",
    "38 26% 94%",
    "36 24% 93%",
  ],
} as const;

export type SuggestionSource = keyof typeof suggestionPalettes;
