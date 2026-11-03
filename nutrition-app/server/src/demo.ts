/**
 * Demo server with a canned recognizer — runs the full app flow without an
 * Anthropic API key (UI development, screenshots, e2e checks).
 */
import { buildFoodItem, sumMacros } from '../../shared/nutrition';
import type { FoodRecognizer } from './ai';
import { createApp } from './app';
import { OpenFoodFactsLookup } from './barcode';

const canned = () => {
  const items = [
    buildFoodItem('Гречка отварная', 180, { calories: 110, protein: 4.2, fat: 1.1, carbs: 21.3 }, 0.85),
    buildFoodItem('Куриная грудка запечённая', 150, { calories: 165, protein: 31, fat: 3.6, carbs: 0 }, 0.8),
    buildFoodItem('Салат из огурцов и томатов', 120, { calories: 45, protein: 1, fat: 2.8, carbs: 4 }, 0.55),
  ];
  return { items, totals: sumMacros(items), note: 'Демо-режим: ответ без обращения к ИИ.' };
};

const recognizer: FoodRecognizer = {
  fromPhoto: async () => canned(),
  fromText: async () => canned(),
};

const port = Number(process.env.PORT ?? 8787);
createApp({ recognizer, barcode: new OpenFoodFactsLookup() }).listen(port, () =>
  console.log(`NutriAI DEMO API on http://0.0.0.0:${port}`),
);
