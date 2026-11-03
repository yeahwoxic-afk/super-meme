import { describe, expect, it } from 'vitest';
import {
  findWorkoutType,
  stepsKcal,
  totalBurned,
  totalMinutes,
  workoutKcal,
  WORKOUT_TYPES,
  type WorkoutEntry,
} from '../../shared/workouts';

describe('workoutKcal (net MET)', () => {
  it('matches the ACSM equation minus resting MET', () => {
    // run 10 km/h, 70 kg, 30 min: (9.8 - 1) * 3.5 * 70 / 200 * 30 = 323.4
    expect(workoutKcal(9.8, 'moderate', 30, 70)).toBe(323);
  });

  it('scales with intensity', () => {
    const light = workoutKcal(5, 'light', 60, 80);
    const mod = workoutKcal(5, 'moderate', 60, 80);
    const hard = workoutKcal(5, 'vigorous', 60, 80);
    expect(light).toBeLessThan(mod);
    expect(hard).toBeGreaterThan(mod);
    // strength 5 MET, 80 kg, 60 min: 4 * 3.5 * 80 / 200 * 60 = 336
    expect(mod).toBe(336);
  });

  it('returns 0 for empty duration and never goes negative', () => {
    expect(workoutKcal(5, 'moderate', 0, 70)).toBe(0);
    expect(workoutKcal(1, 'light', 30, 70)).toBe(0);
  });
});

describe('catalog', () => {
  it('has both strength and cardio with unique ids and sane MET', () => {
    const ids = new Set(WORKOUT_TYPES.map((w) => w.id));
    expect(ids.size).toBe(WORKOUT_TYPES.length);
    expect(WORKOUT_TYPES.some((w) => w.category === 'strength')).toBe(true);
    expect(WORKOUT_TYPES.some((w) => w.category === 'cardio')).toBe(true);
    for (const w of WORKOUT_TYPES) expect(w.met).toBeGreaterThan(1.5);
    expect(findWorkoutType('swim')?.category).toBe('cardio');
  });

  it('sums a day of workouts', () => {
    const w = (kcal: number, minutes: number): WorkoutEntry => ({
      id: String(kcal), typeId: 'custom', name: 'x', category: 'cardio', minutes, intensity: 'moderate', kcal, createdAt: '',
    });
    expect(totalBurned([w(200, 30), w(150, 45)])).toBe(350);
    expect(totalMinutes([w(200, 30), w(150, 45)])).toBe(75);
  });
});

describe('stepsKcal', () => {
  it('converts steps to net walking calories', () => {
    // 10 000 steps = 100 min; (3.5 - 1) * 3.5 * 80 / 200 * 100 = 350
    expect(stepsKcal(10000, 80)).toBe(350);
    expect(stepsKcal(5000, 60)).toBe(131);
  });
  it('is zero without steps', () => {
    expect(stepsKcal(0, 80)).toBe(0);
  });
});
