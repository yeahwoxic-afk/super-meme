/** Intermittent-fasting timer logic (16:8 and friends). */

export interface FastingProtocol {
  id: string;
  label: string;
  fastHours: number;
  eatHours: number;
}

export const FASTING_PROTOCOLS: readonly FastingProtocol[] = [
  { id: '12:12', label: '12:12', fastHours: 12, eatHours: 12 },
  { id: '14:10', label: '14:10', fastHours: 14, eatHours: 10 },
  { id: '16:8', label: '16:8', fastHours: 16, eatHours: 8 },
  { id: '18:6', label: '18:6', fastHours: 18, eatHours: 6 },
  { id: '20:4', label: '20:4', fastHours: 20, eatHours: 4 },
  { id: '23:1', label: 'OMAD 23:1', fastHours: 23, eatHours: 1 },
];

export function findProtocol(id: string): FastingProtocol {
  return FASTING_PROTOCOLS.find((p) => p.id === id) ?? FASTING_PROTOCOLS[2];
}

export interface FastingStatus {
  /** `fasting` until the goal is reached, then `completed` (user should end the fast). */
  phase: 'fasting' | 'completed';
  elapsedMs: number;
  remainingMs: number;
  /** 0..1 */
  progress: number;
  goalEndsAt: Date;
}

const HOUR = 3_600_000;

/** Status of an active fast that started at `startedAt`. */
export function fastingStatus(startedAt: Date, protocol: FastingProtocol, now: Date): FastingStatus {
  const goalMs = protocol.fastHours * HOUR;
  const elapsedMs = Math.max(0, now.getTime() - startedAt.getTime());
  const remainingMs = Math.max(0, goalMs - elapsedMs);
  return {
    phase: remainingMs === 0 ? 'completed' : 'fasting',
    elapsedMs,
    remainingMs,
    progress: Math.min(1, elapsedMs / goalMs),
    goalEndsAt: new Date(startedAt.getTime() + goalMs),
  };
}

/** Metabolic stage reached after N hours of fasting (informational, approximate). */
export function fastingStage(elapsedMs: number): string {
  const h = elapsedMs / HOUR;
  if (h < 4) return 'Пищеварение';
  if (h < 12) return 'Снижение инсулина';
  if (h < 16) return 'Переход на жиры';
  if (h < 24) return 'Кетоз';
  return 'Глубокий кетоз';
}

/** Formats milliseconds as `HH:MM:SS`. */
export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}
