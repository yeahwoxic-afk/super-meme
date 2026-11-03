/**
 * Detects whether the app runs inside a Claude artifact viewer (the
 * "open by link" web build). There, AI calls go to the viewer's own Claude
 * account (`sample`) and data is stored in the artifact's private per-user
 * database (`db`) instead of the NutriAI server and device storage.
 */

interface ClaudeHost {
  use(name: string): Promise<unknown>;
}

const host = (): ClaudeHost | undefined =>
  typeof window !== 'undefined' ? (window as unknown as { claude?: ClaudeHost }).claude : undefined;

/** True when served inside a Claude viewer. */
export const inClaude = (): boolean => typeof host()?.use === 'function';

/** Resolves a Claude runtime capability, or null when unavailable. */
export async function useCapability<T>(name: string): Promise<T | null> {
  const h = host();
  if (!h?.use) return null;
  try {
    return ((await h.use(name)) as T | null) ?? null;
  } catch {
    return null;
  }
}

/* Minimal typings for the capabilities the app uses. */

export interface SampleError {
  code: string;
  message: string;
}

export interface SampleFn {
  json<T = unknown>(
    input: string,
    options?: { images?: Blob[]; modelTier?: 'quick' | 'default' | 'complex'; effort?: 'low' | 'medium' | 'high'; cache?: boolean },
  ): Promise<T>;
  limits(): Promise<{ images?: { maxCount: number } }>;
}

export interface DocSnap {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface DocRef {
  get(): Promise<DocSnap>;
  set(data: Record<string, unknown>): Promise<void>;
}

export interface CollectionRef {
  doc(id: string): DocRef;
  get(): Promise<{ docs: DocSnap[] }>;
}

export interface Db {
  collection(path: string): CollectionRef;
}

export interface UserCap {
  id(): Promise<string | null>;
}
