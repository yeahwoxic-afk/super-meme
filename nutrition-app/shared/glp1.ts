/**
 * GLP-1 medication log helpers. This is a diary, not medical advice — doses
 * are whatever the user's doctor prescribed; the app only reminds and records.
 */

export type Glp1Frequency = 'daily' | 'weekly';

export interface Glp1Medication {
  id: string;
  name: string;
  substance: string;
  frequency: Glp1Frequency;
  /** Typical pen strengths in mg (for quick-pick only). */
  doses: number[];
}

export const GLP1_MEDICATIONS: readonly Glp1Medication[] = [
  { id: 'semaglutide_inj', name: 'Оземпик / Вегови', substance: 'семаглутид', frequency: 'weekly', doses: [0.25, 0.5, 1, 1.7, 2, 2.4] },
  { id: 'semaglutide_oral', name: 'Рибелсас', substance: 'семаглутид (таблетки)', frequency: 'daily', doses: [3, 7, 14] },
  { id: 'tirzepatide', name: 'Мунджаро / Зепбаунд', substance: 'тирзепатид', frequency: 'weekly', doses: [2.5, 5, 7.5, 10, 12.5, 15] },
  { id: 'liraglutide', name: 'Саксенда / Виктоза', substance: 'лираглутид', frequency: 'daily', doses: [0.6, 1.2, 1.8, 2.4, 3] },
  { id: 'dulaglutide', name: 'Трулисити', substance: 'дулаглутид', frequency: 'weekly', doses: [0.75, 1.5, 3, 4.5] },
];

export const INJECTION_SITES = [
  'Живот слева',
  'Живот справа',
  'Бедро слева',
  'Бедро справа',
  'Плечо слева',
  'Плечо справа',
] as const;
export type InjectionSite = (typeof INJECTION_SITES)[number];

export interface Glp1Dose {
  id: string;
  medicationId: string;
  doseMg: number;
  site?: InjectionSite;
  takenAt: string; // ISO
  sideEffects?: string;
}

export function findMedication(id: string): Glp1Medication | undefined {
  return GLP1_MEDICATIONS.find((m) => m.id === id);
}

const DAY = 86_400_000;

/** When the next dose is due, based on the latest logged dose. */
export function nextDoseDue(lastDose: Glp1Dose, med: Glp1Medication): Date {
  const interval = med.frequency === 'weekly' ? 7 * DAY : DAY;
  return new Date(new Date(lastDose.takenAt).getTime() + interval);
}

/** Suggests the next injection site so the user rotates through all of them. */
export function suggestNextSite(history: readonly Glp1Dose[]): InjectionSite {
  const last = [...history]
    .filter((d) => d.site)
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0];
  if (!last?.site) return INJECTION_SITES[0];
  const i = INJECTION_SITES.indexOf(last.site);
  return INJECTION_SITES[(i + 1) % INJECTION_SITES.length];
}

/** Whole days (can be negative = overdue) until the next dose. */
export function daysUntil(due: Date, now: Date): number {
  return Math.ceil((due.getTime() - now.getTime()) / DAY);
}
