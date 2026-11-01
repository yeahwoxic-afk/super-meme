/**
 * Tuning knobs for every number the app uses. Values live here — never inline
 * in the calculators — so they can be adjusted (or later fetched from the
 * server) without touching the logic. Sources are listed next to each value.
 */
import type { ActivityLevel, GoalType } from './types';

export const NUTRITION_CONFIG = {
  /** Atwater factors, kcal per gram. */
  kcalPerGram: { protein: 4, fat: 9, carbs: 4 },

  /** TDEE multipliers for the Mifflin–St Jeor BMR (standard Harris/FAO set). */
  activityFactor: {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
  } satisfies Record<ActivityLevel, number>,

  /** Calorie adjustment relative to TDEE (fraction). ~0.5 kg/week loss at -20 %. */
  goalCalorieDelta: {
    lose: -0.2,
    maintain: 0,
    gain: 0.12,
    healthy: 0,
  } satisfies Record<GoalType, number>,

  /** Protein, grams per kg body weight (ISSN position stand ranges). */
  proteinPerKg: {
    lose: 1.8,
    maintain: 1.4,
    gain: 1.8,
    healthy: 1.2,
  } satisfies Record<GoalType, number>,

  /**
   * Users on GLP-1 drugs eat much less and risk losing lean mass, so protein
   * gets a floor and the deficit is capped (appetite is already suppressed).
   */
  glp1: {
    proteinPerKgMin: 1.6,
    maxDeficit: 0.25,
  },

  /** Share of calories from fat. */
  fatShare: 0.28,

  /** Never recommend below these intakes (common clinical floors). */
  minCalories: { male: 1500, female: 1200 },

  /** Water: ml per kg body weight. */
  waterMlPerKg: 33,

  /** Fiber: grams per 1000 kcal (dietary guidelines). */
  fiberPer1000Kcal: 14,

  /** Daily step goal. */
  steps: { lose: 10000, maintain: 8000, gain: 7000, healthy: 8000 } satisfies Record<GoalType, number>,

  /** BMI uses a mid-normal weight for protein when the user is obese (avoids absurd protein targets). */
  proteinReferenceBmi: 25,
  obeseBmi: 30,

  /** Quick-add water buttons, ml. */
  waterQuickAdd: [150, 250, 500],
} as const;
