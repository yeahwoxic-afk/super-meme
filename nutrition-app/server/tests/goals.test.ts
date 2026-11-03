import { describe, expect, it } from 'vitest';
import { bmi, calcBmr, calcDailyTargets, proteinReferenceWeight, weeksToTarget } from '../../shared/goals';
import type { UserProfile } from '../../shared/types';

const male = (o: Partial<UserProfile> = {}): UserProfile => ({
  sex: 'male', age: 30, heightCm: 180, weightKg: 80, activity: 'moderate', goal: 'maintain', onGlp1: false, ...o,
});

describe('calcBmr (Mifflin–St Jeor)', () => {
  it('matches the reference formula for a man', () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(calcBmr(male())).toBe(1780);
  });
  it('uses -161 for women', () => {
    // 10*60 + 6.25*165 - 5*25 - 161 = 1345.25
    expect(calcBmr({ sex: 'female', age: 25, heightCm: 165, weightKg: 60 })).toBeCloseTo(1345.25);
  });
});

describe('calcDailyTargets', () => {
  it('maintain = TDEE', () => {
    const t = calcDailyTargets(male());
    expect(t.tdee).toBe(Math.round(1780 * 1.55));
    expect(t.calories).toBe(t.tdee);
  });

  it('lose applies a 20% deficit and higher protein', () => {
    const t = calcDailyTargets(male({ goal: 'lose' }));
    expect(t.calories).toBe(Math.round(1780 * 1.55 * 0.8));
    expect(t.protein).toBe(Math.round(1.8 * 80));
  });

  it('gain applies a surplus', () => {
    const t = calcDailyTargets(male({ goal: 'gain' }));
    expect(t.calories).toBeGreaterThan(t.tdee);
  });

  it('never goes below the minimum calorie floor', () => {
    const t = calcDailyTargets({
      sex: 'female', age: 70, heightCm: 150, weightKg: 45, activity: 'sedentary', goal: 'lose', onGlp1: false,
    });
    expect(t.calories).toBe(1200);
  });

  it('macros add up to the calorie target (±1%)', () => {
    for (const goal of ['lose', 'maintain', 'gain', 'healthy'] as const) {
      const t = calcDailyTargets(male({ goal }));
      const kcal = t.protein * 4 + t.fat * 9 + t.carbs * 4;
      expect(Math.abs(kcal - t.calories) / t.calories).toBeLessThan(0.01);
    }
  });

  it('GLP-1 users get a protein floor of 1.6 g/kg', () => {
    const t = calcDailyTargets(male({ goal: 'healthy', onGlp1: true }));
    expect(t.protein).toBe(Math.round(1.6 * 80));
  });

  it('water and steps targets are set', () => {
    const t = calcDailyTargets(male({ goal: 'lose' }));
    expect(t.waterMl).toBe(2650);
    expect(t.steps).toBe(10000);
  });
});

describe('proteinReferenceWeight', () => {
  it('uses actual weight below BMI 30', () => {
    expect(proteinReferenceWeight(80, 180)).toBe(80);
  });
  it('caps to BMI 25 weight when obese', () => {
    expect(bmi(130, 180)).toBeGreaterThan(30);
    expect(proteinReferenceWeight(130, 180)).toBeCloseTo(81);
  });
});

describe('weeksToTarget', () => {
  it('estimates weeks for weight loss', () => {
    const p = male({ goal: 'lose', targetWeightKg: 75 });
    const t = calcDailyTargets(p);
    const w = weeksToTarget(p, t)!;
    expect(w).toBeGreaterThan(5);
    expect(w).toBeLessThan(15);
  });
  it('returns null when the plan moves away from the target', () => {
    const p = male({ goal: 'gain', targetWeightKg: 70 });
    expect(weeksToTarget(p, calcDailyTargets(p))).toBeNull();
  });
});
