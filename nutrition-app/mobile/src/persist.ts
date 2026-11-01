/**
 * Persistence. Always keeps a copy on the device (AsyncStorage / localStorage).
 * Inside a Claude viewer it also syncs to the artifact's database, in the
 * viewer's private folder `data/users/<id>/` (nobody else, not even the
 * artifact owner, can read it): one `core` document plus one document per day,
 * so no document approaches the 256 KiB limit.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FoodEntry } from '../../shared/types';
import type { WorkoutEntry } from '../../shared/workouts';
import { useCapability, type CollectionRef, type Db, type UserCap } from './runtime';
import type { AppState } from './store';

const LOCAL_KEY = 'nutri-ai/state/v1';

export async function loadLocal(): Promise<Partial<AppState> | null> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Partial<AppState>) : null;
  } catch {
    return null;
  }
}

export function saveLocal(state: AppState): void {
  AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(state)).catch(() => {});
}

type Docs = Record<string, Record<string, unknown>>;

interface DayDoc {
  day: string;
  entries: FoodEntry[];
  waterMl: number;
  steps: number | null;
  workouts?: WorkoutEntry[];
}

/** Splits app state into database documents keyed by document id. */
export function toDocs(s: AppState): Docs {
  const docs: Docs = {
    core: { profile: s.profile, weights: s.weights, fasting: s.fasting, glp1: s.glp1 },
  };
  const days = new Set([...Object.keys(s.entries), ...Object.keys(s.waterMl), ...Object.keys(s.manualSteps), ...Object.keys(s.workouts)]);
  for (const day of days) {
    const d: DayDoc = {
      day,
      entries: s.entries[day] ?? [],
      waterMl: s.waterMl[day] ?? 0,
      steps: s.manualSteps[day] ?? null,
      workouts: s.workouts[day] ?? [],
    };
    docs[`d${day}`] = d as unknown as Record<string, unknown>;
  }
  return docs;
}

/** Rebuilds app state from database documents. */
export function fromDocs(docs: Docs): Partial<AppState> | null {
  const core = docs.core as Partial<AppState> | undefined;
  if (!core) return null;
  const s: Partial<AppState> = {
    profile: core.profile ?? null,
    weights: core.weights ?? [],
    fasting: core.fasting,
    glp1: core.glp1,
    entries: {},
    waterMl: {},
    manualSteps: {},
    workouts: {},
  };
  for (const [id, body] of Object.entries(docs)) {
    if (!id.startsWith('d')) continue;
    const d = body as unknown as DayDoc;
    if ((d.entries ?? []).length) s.entries![d.day] = d.entries;
    if (d.waterMl) s.waterMl![d.day] = d.waterMl;
    if (d.steps != null) s.manualSteps![d.day] = d.steps;
    if ((d.workouts ?? []).length) s.workouts![d.day] = d.workouts!;
  }
  return s;
}

/** Cloud sync inside a Claude viewer. `connect()` resolves null elsewhere. */
export class CloudSync {
  private saved = new Map<string, string>();
  private pending: AppState | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing = false;

  private constructor(private readonly col: CollectionRef) {}

  static async connect(): Promise<CloudSync | null> {
    const [db, user] = await Promise.all([useCapability<Db>('db'), useCapability<UserCap>('user')]);
    if (!db || !user) return null;
    const id = await user.id().catch(() => null);
    if (!id) return null;
    return new CloudSync(db.collection(`data/users/${id}`));
  }

  /** Loads the saved state, or null when this person has none yet. */
  async load(): Promise<Partial<AppState> | null> {
    const snap = await this.col.get();
    const docs: Docs = {};
    for (const d of snap.docs) {
      const body = d.data();
      if (d.exists && body) {
        docs[d.id] = body;
        this.saved.set(d.id, JSON.stringify(body));
      }
    }
    return fromDocs(docs);
  }

  /** Schedules a save; only documents whose content changed are written. */
  save(state: AppState): void {
    this.pending = state;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 800);
  }

  private async flush(): Promise<void> {
    if (this.writing || !this.pending) return;
    this.writing = true;
    const state = this.pending;
    this.pending = null;
    try {
      for (const [id, body] of Object.entries(toDocs(state))) {
        const json = JSON.stringify(body);
        if (this.saved.get(id) === json) continue;
        // JSON round-trip drops `undefined`, which the store rejects.
        await this.col.doc(id).set(JSON.parse(json));
        this.saved.set(id, json);
      }
    } catch {
      // Keep the device copy; the next change retries the cloud write.
    } finally {
      this.writing = false;
      if (this.pending) void this.flush();
    }
  }
}
