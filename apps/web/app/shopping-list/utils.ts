export function formatQuantity(quantity: number, unit: string | null) {
  const formatter = new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: 2,
    minimumFractionDigits: quantity % 1 === 0 ? 0 : 1,
  });
  const formatted = formatter.format(quantity);
  return unit ? `${formatted} ${unit}` : formatted;
}

export const FALL_BADGE_PALETTE = [
  "24 94% 42%", // amber
  "18 80% 40%", // pumpkin
  "12 78% 36%", // rust
  "6 72% 36%", // brick red
  "30 85% 38%", // orange
  "40 70% 32%", // ochre
  "16 68% 34%", // terracotta
];
