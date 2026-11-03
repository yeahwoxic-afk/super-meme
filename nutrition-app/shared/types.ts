/** Shared domain types used by the mobile app and the AI service. */

export type Sex = 'male' | 'female';

/** Activity level, mapped to a TDEE multiplier in `config.ts`. */
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

/** What the user wants to achieve. */
export type GoalType = 'lose' | 'maintain' | 'gain' | 'healthy';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/** Macronutrients for a given amount of food. All values are absolute (not per 100 g). */
export interface Macros {
  calories: number; // kcal
  protein: number; // g
  fat: number; // g
  carbs: number; // g
}

/** Where a food entry came from. */
export type FoodSource = 'photo' | 'voice' | 'text' | 'barcode' | 'manual';

/** One recognized food item, as returned by the AI service or the barcode lookup. */
export interface FoodItem extends Macros {
  name: string;
  grams: number;
  /** Nutrition per 100 g, so the user can change the portion and we can rescale. */
  per100g: Macros;
  /** 0..1 — how sure the recognizer is. 1 for barcode / manual input. */
  confidence: number;
}

/** A food item saved into the diary. */
export interface FoodEntry extends FoodItem {
  id: string;
  meal: MealType;
  source: FoodSource;
  createdAt: string; // ISO timestamp
}

export interface UserProfile {
  sex: Sex;
  age: number; // years
  heightCm: number;
  weightKg: number;
  targetWeightKg?: number;
  activity: ActivityLevel;
  goal: GoalType;
  /** The user is on a GLP-1 medication (semaglutide, tirzepatide, …). */
  onGlp1: boolean;
}

/** Daily targets calculated from the profile. */
export interface DailyTargets extends Macros {
  bmr: number;
  tdee: number;
  waterMl: number;
  steps: number;
  fiber: number; // g
}

/** Result returned by the AI recognizer (photo / voice / text). */
export interface RecognitionResult {
  items: FoodItem[];
  totals: Macros;
  /** Short human-readable note from the model, e.g. "portion estimated by plate size". */
  note?: string;
}
