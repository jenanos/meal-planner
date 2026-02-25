"use client";
import React from "react";
import Twemoji from "react-twemoji";

const emojiByCategory: Record<string, string> = {
  VEGETAR: "🌱",
  KYLLING: "🐔",
  STORFE: "🐄",
  FISK: "🐟",
  ANNET: "❓",
};

export function CategoryEmoji({
  category,
  size = 10,
}: {
  category?: string | null;
  size?: number;
}) {
  if (!category) return null;
  const emoji = emojiByCategory[category.toUpperCase()] ?? "❓";
  return (
    <Twemoji options={{ className: "twemoji", folder: "svg", ext: ".svg" }}>
      <span style={{ fontSize: `${size}px`, lineHeight: 1 }}>{emoji}</span>
    </Twemoji>
  );
}

const ingredientCategoryLabels: Record<string, string> = {
  FRUKT: "🍎 Frukt",
  GRONNSAKER: "🥬 Grønnsaker",
  KJOTT: "🥩🐟 Kjøtt og fisk",
  OST: "🧀 Ost",
  MEIERI_OG_EGG: "🥛 Meieri & Egg",
  BROD: "🍞 Brød",
  BAKEVARER: "🧁 Bakevarer",
  HERMETIKK: "🥫 Hermetikk",
  TORRVARER: "🌾 Tørrvarer",
  ANNET: "❓ Annet",
};

export function ingredientCategoryLabel(cat: string) {
  return ingredientCategoryLabels[cat] ?? cat;
}

const healthLabels: Record<number, string> = {
  1: "😰 Ikke så sunt",
  2: "🤷 Lite sunn",
  3: "😐 Middels sunn",
  4: "😊 Sunn",
  5: "💪 Veldig sunn",
};

const everydayLabels: Record<number, string> = {
  1: "🍳 Skikkelig hverdagsmat",
  2: "🥘 Hverdagsmat",
  3: "🍽️ Vanlig",
  4: "🥂 Litt helgemat",
  5: "🎉 Helgemat",
};

export function healthLabel(score: number) {
  return healthLabels[score] ?? `Score ${score}`;
}

export function everydayLabel(score: number) {
  return everydayLabels[score] ?? `Score ${score}`;
}

const recipeCategoryLabels: Record<string, string> = {
  FISK: "🐟 Fisk",
  KYLLING: "🐔 Kylling",
  VEGETAR: "🌱 Vegetar",
  STORFE: "🐄 Storfe",
  ANNET: "❓ Annet",
};

export function recipeCategoryLabel(cat: string) {
  return recipeCategoryLabels[cat] ?? cat;
}
