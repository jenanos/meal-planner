export function formatQuantity(quantity: number, unit: string | null) {
  const formatter = new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: 2,
    minimumFractionDigits: quantity % 1 === 0 ? 0 : 1,
  });
  const formatted = formatter.format(quantity);
  return unit ? `${formatted} ${unit}` : formatted;
}

export const GRID_TILE_COLORS = [
  { bg: "hsl(210, 100%, 95%)", border: "hsl(210, 80%, 85%)" }, // soft blue
  { bg: "hsl(145, 80%, 93%)", border: "hsl(145, 60%, 82%)" }, // soft green
  { bg: "hsl(45, 100%, 93%)", border: "hsl(45, 80%, 82%)" }, // soft yellow
  { bg: "hsl(340, 80%, 95%)", border: "hsl(340, 60%, 85%)" }, // soft pink
  { bg: "hsl(270, 80%, 95%)", border: "hsl(270, 60%, 85%)" }, // soft purple
  { bg: "hsl(180, 70%, 93%)", border: "hsl(180, 50%, 82%)" }, // soft teal
  { bg: "hsl(25, 100%, 93%)", border: "hsl(25, 80%, 82%)" }, // soft orange
  { bg: "hsl(230, 80%, 95%)", border: "hsl(230, 60%, 85%)" }, // soft lavender
  { bg: "hsl(160, 70%, 93%)", border: "hsl(160, 50%, 82%)" }, // soft mint
  { bg: "hsl(15, 90%, 94%)", border: "hsl(15, 70%, 84%)" }, // soft peach
];

export function stableColorIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % GRID_TILE_COLORS.length;
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
