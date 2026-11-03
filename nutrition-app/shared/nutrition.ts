/** Pure helpers for portion scaling and totals. */
import { NUTRITION_CONFIG as C } from './config';
import type { FoodItem, Macros } from './types';

export const ZERO_MACROS: Macros = { calories: 0, protein: 0, fat: 0, carbs: 0 };

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Rounds kcal to integers and grams to one decimal. */
export function roundMacros(m: Macros): Macros {
  return {
    calories: Math.round(m.calories),
    protein: round1(m.protein),
    fat: round1(m.fat),
    carbs: round1(m.carbs),
  };
}

/** Absolute macros for `grams` of a food with the given per-100 g values. */
export function scaleMacros(per100g: Macros, grams: number): Macros {
  const k = Math.max(0, grams) / 100;
  return roundMacros({
    calories: per100g.calories * k,
    protein: per100g.protein * k,
    fat: per100g.fat * k,
    carbs: per100g.carbs * k,
  });
}

/** Returns a copy of the item with a new portion size and rescaled macros. */
export function withGrams<T extends FoodItem>(item: T, grams: number): T {
  return { ...item, grams, ...scaleMacros(item.per100g, grams) };
}

export function sumMacros(items: readonly Macros[]): Macros {
  return roundMacros(
    items.reduce(
      (a, b) => ({
        calories: a.calories + b.calories,
        protein: a.protein + b.protein,
        fat: a.fat + b.fat,
        carbs: a.carbs + b.carbs,
      }),
      ZERO_MACROS,
    ),
  );
}

/** Energy implied by macros using Atwater factors. */
export function caloriesFromMacros(m: Omit<Macros, 'calories'>): number {
  return m.protein * C.kcalPerGram.protein + m.fat * C.kcalPerGram.fat + m.carbs * C.kcalPerGram.carbs;
}

/**
 * Builds a consistent FoodItem from per-100 g values. If the stated calories
 * disagree with the macros by more than 25 %, the macro-derived value wins
 * (protects against hallucinated / mistyped numbers).
 */
export function buildFoodItem(
  name: string,
  grams: number,
  per100g: Macros,
  confidence = 1,
): FoodItem {
  const implied = caloriesFromMacros(per100g);
  const stated = per100g.calories;
  const fixed =
    implied > 0 && (stated <= 0 || Math.abs(stated - implied) / implied > 0.25)
      ? { ...per100g, calories: implied }
      : per100g;
  const p100 = roundMacros(fixed);
  return { name, grams, per100g: p100, confidence, ...scaleMacros(p100, grams) };
}

/** Percentage of target, clamped to [0, 999]. */
export function percentOf(value: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(999, Math.round((value / target) * 100));
}
