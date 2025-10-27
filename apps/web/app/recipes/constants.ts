export { CATEGORIES } from "@repo/database";

export const STEP_TITLES = ["Navn", "Detaljer", "Ingredienser", "Beskrivelse"] as const;

export const STEP_DESCRIPTIONS = [
  "Gi oppskriften et navn eller velg en eksisterende.",
  "Velg kategori og scorer.",
  "Finn og legg til ingredienser.",
  "Fortell kort om oppskriften.",
] as const;

export const VIEW_STEPS = [
  { id: "view-recipe-section-ingredients", label: "Ingredienser" },
  { id: "view-recipe-section-description", label: "Beskrivelse" },
] as const;
