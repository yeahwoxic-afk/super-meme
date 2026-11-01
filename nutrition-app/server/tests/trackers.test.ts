import { describe, expect, it } from 'vitest';
import { addDays, dayKey, humanDay } from '../../shared/date';
import { fastingStage, fastingStatus, findProtocol, formatDuration } from '../../shared/fasting';
import { daysUntil, findMedication, nextDoseDue, suggestNextSite, type Glp1Dose } from '../../shared/glp1';
import { buildFoodItem, percentOf, scaleMacros, sumMacros, withGrams } from '../../shared/nutrition';

const H = 3_600_000;

describe('nutrition', () => {
  const rice = { calories: 130, protein: 2.7, fat: 0.3, carbs: 28 };

  it('scales per-100g values to a portion', () => {
    expect(scaleMacros(rice, 150)).toEqual({ calories: 195, protein: 4.1, fat: 0.5, carbs: 42 });
  });

  it('rescales an item when grams change', () => {
    const item = buildFoodItem('Рис', 100, rice);
    expect(withGrams(item, 200).calories).toBe(260);
  });

  it('repairs calories that contradict macros', () => {
    // 10 g protein + 10 g fat + 10 g carbs = 170 kcal, stated 999
    const item = buildFoodItem('X', 100, { calories: 999, protein: 10, fat: 10, carbs: 10 });
    expect(item.calories).toBe(170);
  });

  it('keeps stated calories when close to macros (fibre, alcohol rounding)', () => {
    const item = buildFoodItem('Рис', 100, rice);
    expect(item.calories).toBe(130);
  });

  it('sums macros', () => {
    expect(sumMacros([scaleMacros(rice, 100), scaleMacros(rice, 100)]).calories).toBe(260);
  });

  it('percentOf handles zero target', () => {
    expect(percentOf(10, 0)).toBe(0);
    expect(percentOf(50, 200)).toBe(25);
  });
});

describe('fasting', () => {
  const start = new Date(2026, 0, 1, 20, 0, 0);
  const p168 = findProtocol('16:8');

  it('reports progress mid-fast', () => {
    const s = fastingStatus(start, p168, new Date(start.getTime() + 8 * H));
    expect(s.phase).toBe('fasting');
    expect(s.progress).toBeCloseTo(0.5);
    expect(s.remainingMs).toBe(8 * H);
    expect(s.goalEndsAt.getHours()).toBe(12);
  });

  it('completes after the goal', () => {
    const s = fastingStatus(start, p168, new Date(start.getTime() + 17 * H));
    expect(s.phase).toBe('completed');
    expect(s.progress).toBe(1);
    expect(s.remainingMs).toBe(0);
  });

  it('falls back to 16:8 for unknown protocol', () => {
    expect(findProtocol('nope').id).toBe('16:8');
  });

  it('formats durations and stages', () => {
    expect(formatDuration(16 * H + 5 * 60_000 + 7_000)).toBe('16:05:07');
    expect(fastingStage(13 * H)).toBe('Переход на жиры');
  });
});

describe('GLP-1', () => {
  const dose = (takenAt: string, site?: Glp1Dose['site']): Glp1Dose => ({
    id: takenAt, medicationId: 'semaglutide_inj', doseMg: 0.5, takenAt, site,
  });

  it('weekly medication is due in 7 days', () => {
    const med = findMedication('semaglutide_inj')!;
    const due = nextDoseDue(dose('2026-01-01T09:00:00.000Z'), med);
    expect(due.toISOString()).toBe('2026-01-08T09:00:00.000Z');
    expect(daysUntil(due, new Date('2026-01-06T09:00:00.000Z'))).toBe(2);
  });

  it('daily medication is due tomorrow', () => {
    const med = findMedication('liraglutide')!;
    expect(nextDoseDue(dose('2026-01-01T09:00:00.000Z'), med).toISOString()).toBe('2026-01-02T09:00:00.000Z');
  });

  it('rotates injection sites', () => {
    expect(suggestNextSite([])).toBe('Живот слева');
    expect(
      suggestNextSite([dose('2026-01-01T00:00:00Z', 'Живот слева'), dose('2026-01-08T00:00:00Z', 'Бедро справа')]),
    ).toBe('Плечо слева');
  });
});

describe('dates', () => {
  it('handles day keys across months', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(dayKey(new Date(2026, 4, 9))).toBe('2026-05-09');
    expect(humanDay('2026-05-09', '2026-05-09')).toBe('Сегодня');
    expect(humanDay('2026-05-08', '2026-05-09')).toBe('Вчера');
    expect(humanDay('2026-10-05', '2026-11-01')).toBe('5 окт');
  });
});
