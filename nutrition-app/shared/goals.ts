/**
 * Personalised daily targets.
 *
 * BMR  — Mifflin–St Jeor:  10·W + 6.25·H − 5·A + s,  s = +5 (male) / −161 (female)
 * TDEE — BMR · activityFactor
 * kcal — TDEE · (1 + goalDelta), floored at minCalories[sex]
 * P    — proteinPerKg[goal] · refWeight   (refWeight = weight at BMI 25 when BMI ≥ 30)
 * F    — kcal · fatShare / 9
 * C    — (kcal − 4P − 9F) / 4, never below 0
 */
import { NUTRITION_CONFIG as C } from './config';
import type { DailyTargets, UserProfile } from './types';

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/** Basal metabolic rate, kcal/day (Mifflin–St Jeor). */
export function calcBmr(p: Pick<UserProfile, 'sex' | 'age' | 'heightCm' | 'weightKg'>): number {
  const s = p.sex === 'male' ? 5 : -161;
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + s;
}

/** Weight used for protein targets — capped to BMI 25 for obese users. */
export function proteinReferenceWeight(weightKg: number, heightCm: number): number {
  if (bmi(weightKg, heightCm) < C.obeseBmi) return weightKg;
  const m = heightCm / 100;
  return C.proteinReferenceBmi * m * m;
}

/** Computes every daily target from the user's profile. */
export function calcDailyTargets(p: UserProfile): DailyTargets {
  const bmr = calcBmr(p);
  const tdee = bmr * C.activityFactor[p.activity];

  let delta: number = C.goalCalorieDelta[p.goal];
  if (p.onGlp1 && delta < -C.glp1.maxDeficit) delta = -C.glp1.maxDeficit;
  const calories = Math.max(tdee * (1 + delta), C.minCalories[p.sex]);

  const refWeight = proteinReferenceWeight(p.weightKg, p.heightCm);
  let proteinPerKg: number = C.proteinPerKg[p.goal];
  if (p.onGlp1) proteinPerKg = Math.max(proteinPerKg, C.glp1.proteinPerKgMin);
  const protein = proteinPerKg * refWeight;

  const fat = (calories * C.fatShare) / C.kcalPerGram.fat;
  const carbs = Math.max(
    0,
    (calories - protein * C.kcalPerGram.protein - fat * C.kcalPerGram.fat) / C.kcalPerGram.carbs,
  );

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    calories: Math.round(calories),
    protein: Math.round(protein),
    fat: Math.round(fat),
    carbs: Math.round(carbs),
    fiber: Math.round((calories / 1000) * C.fiberPer1000Kcal),
    waterMl: Math.round((p.weightKg * C.waterMlPerKg) / 50) * 50,
    steps: C.steps[p.goal],
  };
}

/** Rough weeks to reach target weight at the planned deficit/surplus (7700 kcal ≈ 1 kg). */
export function weeksToTarget(p: UserProfile, t: DailyTargets): number | null {
  if (p.targetWeightKg == null) return null;
  const diffKg = p.targetWeightKg - p.weightKg;
  const dailyDelta = t.calories - t.tdee;
  if (diffKg === 0) return 0;
  if (dailyDelta === 0 || Math.sign(diffKg) !== Math.sign(dailyDelta)) return null;
  return Math.ceil((diffKg * 7700) / (dailyDelta * 7));
}
