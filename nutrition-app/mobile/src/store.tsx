/**
 * App state: profile, food diary and habit trackers. Stored on the device
 * and, inside a Claude viewer, synced to the viewer's private cloud folder
 * (see persist.ts). The server is stateless.
 */
import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { dayKey } from '../../shared/date';
import type { Glp1Dose } from '../../shared/glp1';
import type { FoodEntry, UserProfile } from '../../shared/types';
import type { WorkoutEntry } from '../../shared/workouts';
import { CloudSync, loadLocal, saveLocal } from './persist';
import { inClaude } from './runtime';

export interface FastRecord {
  startedAt: string;
  endedAt: string;
  protocolId: string;
}

export interface WeightRecord {
  day: string;
  kg: number;
}

export interface AppState {
  profile: UserProfile | null;
  entries: Record<string, FoodEntry[]>;
  waterMl: Record<string, number>;
  manualSteps: Record<string, number>;
  workouts: Record<string, WorkoutEntry[]>;
  weights: WeightRecord[];
  fasting: { protocolId: string; startedAt: string | null; history: FastRecord[] };
  glp1: { medicationId: string | null; doses: Glp1Dose[] };
}

export const initialState: AppState = {
  profile: null,
  entries: {},
  waterMl: {},
  manualSteps: {},
  workouts: {},
  weights: [],
  fasting: { protocolId: '16:8', startedAt: null, history: [] },
  glp1: { medicationId: null, doses: [] },
};

type Action =
  | { type: 'hydrate'; state: AppState }
  | { type: 'setProfile'; profile: UserProfile }
  | { type: 'addEntries'; day: string; entries: FoodEntry[] }
  | { type: 'removeEntry'; day: string; id: string }
  | { type: 'restoreEntry'; day: string; entry: FoodEntry; index: number }
  | { type: 'addWater'; day: string; ml: number }
  | { type: 'setSteps'; day: string; steps: number }
  | { type: 'addWorkout'; day: string; workout: WorkoutEntry }
  | { type: 'removeWorkout'; day: string; id: string }
  | { type: 'logWeight'; day: string; kg: number }
  | { type: 'setFastingProtocol'; protocolId: string }
  | { type: 'startFast'; at: string }
  | { type: 'endFast'; at: string }
  | { type: 'setGlp1Medication'; medicationId: string | null }
  | { type: 'logGlp1Dose'; dose: Glp1Dose }
  | { type: 'removeGlp1Dose'; id: string };

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'hydrate':
      return a.state;
    case 'setProfile':
      return { ...s, profile: a.profile };
    case 'addEntries':
      return { ...s, entries: { ...s.entries, [a.day]: [...(s.entries[a.day] ?? []), ...a.entries] } };
    case 'removeEntry':
      return { ...s, entries: { ...s.entries, [a.day]: (s.entries[a.day] ?? []).filter((e) => e.id !== a.id) } };
    case 'restoreEntry': {
      const list = [...(s.entries[a.day] ?? [])];
      if (list.some((e) => e.id === a.entry.id)) return s;
      list.splice(Math.min(Math.max(0, a.index), list.length), 0, a.entry);
      return { ...s, entries: { ...s.entries, [a.day]: list } };
    }
    case 'addWater':
      return { ...s, waterMl: { ...s.waterMl, [a.day]: Math.max(0, (s.waterMl[a.day] ?? 0) + a.ml) } };
    case 'setSteps':
      return { ...s, manualSteps: { ...s.manualSteps, [a.day]: Math.max(0, a.steps) } };
    case 'addWorkout':
      return { ...s, workouts: { ...s.workouts, [a.day]: [...(s.workouts[a.day] ?? []), a.workout] } };
    case 'removeWorkout':
      return { ...s, workouts: { ...s.workouts, [a.day]: (s.workouts[a.day] ?? []).filter((w) => w.id !== a.id) } };
    case 'logWeight': {
      const weights = [...s.weights.filter((w) => w.day !== a.day), { day: a.day, kg: a.kg }].sort((x, y) =>
        x.day.localeCompare(y.day),
      );
      // The latest weigh-in also updates the profile so targets follow the user.
      const latest = weights[weights.length - 1];
      const profile = s.profile && latest.day === a.day ? { ...s.profile, weightKg: a.kg } : s.profile;
      return { ...s, weights, profile };
    }
    case 'setFastingProtocol':
      return { ...s, fasting: { ...s.fasting, protocolId: a.protocolId } };
    case 'startFast':
      return { ...s, fasting: { ...s.fasting, startedAt: a.at } };
    case 'endFast': {
      if (!s.fasting.startedAt) return s;
      const rec: FastRecord = { startedAt: s.fasting.startedAt, endedAt: a.at, protocolId: s.fasting.protocolId };
      return { ...s, fasting: { ...s.fasting, startedAt: null, history: [rec, ...s.fasting.history].slice(0, 60) } };
    }
    case 'setGlp1Medication':
      return { ...s, glp1: { ...s.glp1, medicationId: a.medicationId } };
    case 'logGlp1Dose':
      return { ...s, glp1: { ...s.glp1, doses: [a.dose, ...s.glp1.doses] } };
    case 'removeGlp1Dose':
      return { ...s, glp1: { ...s.glp1, doses: s.glp1.doses.filter((d) => d.id !== a.id) } };
  }
}

interface Ctx {
  state: AppState;
  ready: boolean;
  dispatch: React.Dispatch<Action>;
}

const StoreContext = createContext<Ctx | null>(null);

const merge = (s: Partial<AppState>): AppState => ({
  ...initialState,
  ...s,
  fasting: { ...initialState.fasting, ...s.fasting },
  glp1: { ...initialState.glp1, ...s.glp1 },
});

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [ready, setReady] = React.useState(false);
  const hydrated = useRef(false);
  const cloud = useRef<CloudSync | null>(null);

  useEffect(() => {
    (async () => {
      const local = await loadLocal();
      let loaded = local;
      if (inClaude()) {
        // Inside Claude the private cloud copy is the source of truth;
        // a device-only copy (first sync) is uploaded by the save effect.
        cloud.current = await CloudSync.connect();
        const remote = await cloud.current?.load().catch(() => null);
        if (remote) loaded = remote;
      }
      if (loaded) dispatch({ type: 'hydrate', state: merge(loaded) });
      hydrated.current = true;
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    saveLocal(state);
    cloud.current?.save(state);
  }, [state, ready]);

  const value = useMemo(() => ({ state, ready, dispatch }), [state, ready]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Ctx {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

export const today = () => dayKey();

let counter = 0;
export const newId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
