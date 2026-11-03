/**
 * Workout calorie burn, based on MET values from the Compendium of Physical
 * Activities (Ainsworth et al., 2011/2024).
 *
 *   kcal/min (gross) = MET · 3.5 · weightKg / 200      (ACSM equation)
 *   kcal (net)       = (MET·k − 1) · 3.5 · weightKg / 200 · minutes
 *
 * k is the intensity multiplier. We count NET calories (minus the 1 MET the
 * body burns at rest anyway), so the diary budget is not inflated twice: the
 * resting part is already inside BMR/TDEE.
 */

export type WorkoutCategory = 'strength' | 'cardio';
export type Intensity = 'light' | 'moderate' | 'vigorous';

export interface WorkoutType {
  id: string;
  name: string;
  category: WorkoutCategory;
  icon: string;
  /** MET at moderate intensity. */
  met: number;
}

export const WORKOUT_TYPES: readonly WorkoutType[] = [
  // Силовые
  { id: 'weights', name: 'Тренажёры / свободные веса', category: 'strength', icon: '🏋️', met: 5.0 },
  { id: 'powerlifting', name: 'Тяжёлая силовая (база)', category: 'strength', icon: '💪', met: 6.0 },
  { id: 'circuit', name: 'Круговая / кроссфит', category: 'strength', icon: '🔁', met: 8.0 },
  { id: 'bodyweight', name: 'Свой вес (отжимания, подтягивания)', category: 'strength', icon: '🤸', met: 3.8 },
  { id: 'kettlebell', name: 'Гири', category: 'strength', icon: '🔔', met: 9.8 },
  { id: 'pilates', name: 'Пилатес', category: 'strength', icon: '🧘', met: 3.0 },
  { id: 'yoga', name: 'Йога', category: 'strength', icon: '🕉️', met: 2.5 },
  { id: 'stretching', name: 'Растяжка', category: 'strength', icon: '🙆', met: 2.3 },
  // Кардио
  { id: 'walk', name: 'Быстрая ходьба (5–6 км/ч)', category: 'cardio', icon: '🚶', met: 4.3 },
  { id: 'run8', name: 'Бег 8 км/ч', category: 'cardio', icon: '🏃', met: 8.3 },
  { id: 'run10', name: 'Бег 10 км/ч', category: 'cardio', icon: '🏃', met: 9.8 },
  { id: 'run12', name: 'Бег 12 км/ч', category: 'cardio', icon: '🏃', met: 11.8 },
  { id: 'bike', name: 'Велосипед / велотренажёр', category: 'cardio', icon: '🚴', met: 6.8 },
  { id: 'elliptical', name: 'Эллипс', category: 'cardio', icon: '⚙️', met: 5.0 },
  { id: 'rowing', name: 'Гребной тренажёр', category: 'cardio', icon: '🚣', met: 7.0 },
  { id: 'stairs', name: 'Степпер / лестница', category: 'cardio', icon: '🪜', met: 8.8 },
  { id: 'swim', name: 'Плавание', category: 'cardio', icon: '🏊', met: 5.8 },
  { id: 'hiit', name: 'Интервальная (HIIT)', category: 'cardio', icon: '⚡', met: 8.0 },
  { id: 'jumprope', name: 'Скакалка', category: 'cardio', icon: '🪢', met: 11.8 },
  { id: 'dance', name: 'Танцы / аэробика', category: 'cardio', icon: '💃', met: 7.3 },
  { id: 'teamsport', name: 'Футбол / баскетбол', category: 'cardio', icon: '⚽', met: 7.0 },
];

export const INTENSITIES: readonly { id: Intensity; label: string; factor: number }[] = [
  { id: 'light', label: 'Лёгкая', factor: 0.8 },
  { id: 'moderate', label: 'Средняя', factor: 1 },
  { id: 'vigorous', label: 'Высокая', factor: 1.2 },
];

export const DURATION_PRESETS = [15, 30, 45, 60, 90] as const;

export interface WorkoutEntry {
  id: string;
  /** WORKOUT_TYPES id, or 'custom' for a workout with calories typed in (e.g. from a watch). */
  typeId: string;
  name: string;
  category: WorkoutCategory;
  minutes: number;
  intensity: Intensity;
  kcal: number;
  createdAt: string;
}

export function findWorkoutType(id: string): WorkoutType | undefined {
  return WORKOUT_TYPES.find((w) => w.id === id);
}

export function intensityFactor(i: Intensity): number {
  return INTENSITIES.find((x) => x.id === i)?.factor ?? 1;
}

/** Net calories burned, rounded to whole kcal. */
export function workoutKcal(met: number, intensity: Intensity, minutes: number, weightKg: number): number {
  if (minutes <= 0 || weightKg <= 0) return 0;
  const netMet = Math.max(0, met * intensityFactor(intensity) - 1);
  return Math.round((netMet * 3.5 * weightKg) / 200 * minutes);
}

export function totalBurned(list: readonly WorkoutEntry[]): number {
  return list.reduce((s, w) => s + w.kcal, 0);
}

export function totalMinutes(list: readonly WorkoutEntry[]): number {
  return list.reduce((s, w) => s + w.minutes, 0);
}

/* ---------- Walking (daily steps) ---------- */

/**
 * Everyday walking from the step counter. Assumes a normal pace of about
 * 100 steps/min at ~3.5 MET (Compendium: walking 4.8 km/h), counted net like
 * workouts:  kcal = (MET − 1) · 3.5 · weightKg / 200 · steps / cadence
 * ≈ 0.044 kcal per step at 80 kg (≈ 350 kcal for 10 000 steps).
 */
export const WALKING = { met: 3.5, stepsPerMinute: 100 } as const;

export function stepsKcal(steps: number, weightKg: number): number {
  if (steps <= 0 || weightKg <= 0) return 0;
  const minutes = steps / WALKING.stepsPerMinute;
  return Math.round(((WALKING.met - 1) * 3.5 * weightKg) / 200 * minutes);
}
