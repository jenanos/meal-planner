const healthLabels: Record<number, string> = {
  1: "Ikke så sunt",
  2: "Lite sunn",
  3: "Middels sunn",
  4: "Sunn",
  5: "Veldig sunn",
};

const everydayLabels: Record<number, string> = {
  1: "Skikkelig hverdagsmat",
  2: "Hverdagsmat",
  3: "Vanlig",
  4: "Litt helgemat",
  5: "Helgemat",
};

export function describeHealth(score?: number | null) {
  if (!score) return "Ukjent";
  return healthLabels[score] ?? `Helsescore ${score}`;
}

export function describeEveryday(score?: number | null) {
  if (!score) return "Ukjent";
  return everydayLabels[score] ?? `Hverdags ${score}`;
}

export const HEALTH_LABELS = healthLabels;
export const EVERYDAY_LABELS = everydayLabels;
