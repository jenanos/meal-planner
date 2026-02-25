"use client";

import React, { useState } from "react";
import { IngredientsUnitBoard } from "./components/IngredientsUnitBoard";
import { IngredientsCategoryBoard } from "./components/IngredientsCategoryBoard";
import { RecipesHealthBoard } from "./components/RecipesHealthBoard";
import { RecipesEverydayBoard } from "./components/RecipesEverydayBoard";
import { RecipesCategoryBoard } from "./components/RecipesCategoryBoard";

const VIEWS = [
  { key: "ing-unit", label: "Ingredienser → Enhet" },
  { key: "ing-cat", label: "Ingredienser → Kategori" },
  { key: "rec-health", label: "Oppskrifter → Helsescore" },
  { key: "rec-everyday", label: "Oppskrifter → Hverdagsscore" },
  { key: "rec-cat", label: "Oppskrifter → Kategori" },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];

export default function AdminPage() {
  const [view, setView] = useState<ViewKey>("ing-unit");

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              view === v.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-card-foreground hover:bg-accent"
            }`}
          >
            {v.label}
          </button>
        ))}
      </nav>
      <p className="text-xs text-muted-foreground">
        Dra elementer mellom kolonnene for å endre verdier. Endringer lagres automatisk.
      </p>
      <div className="mt-2">
        {view === "ing-unit" && <IngredientsUnitBoard />}
        {view === "ing-cat" && <IngredientsCategoryBoard />}
        {view === "rec-health" && <RecipesHealthBoard />}
        {view === "rec-everyday" && <RecipesEverydayBoard />}
        {view === "rec-cat" && <RecipesCategoryBoard />}
      </div>
    </div>
  );
}
