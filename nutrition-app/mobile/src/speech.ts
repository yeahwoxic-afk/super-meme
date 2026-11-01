/**
 * On-device speech-to-text. expo-speech-recognition is a native module that is
 * absent from Expo Go, so it is loaded defensively: when unavailable, voice
 * mode falls back to the keyboard's dictation button.
 */
import type { ExpoSpeechRecognitionModule as ModuleType } from 'expo-speech-recognition';
import { inClaude } from './runtime';

type SpeechModule = typeof ModuleType;

let mod: SpeechModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod = require('expo-speech-recognition').ExpoSpeechRecognitionModule as SpeechModule;
} catch {
  mod = null;
}

export const speechAvailable = (): boolean => {
  // A Claude viewer frame refuses microphone access: use keyboard dictation there.
  if (inClaude()) return false;
  try {
    return !!mod && mod.isRecognitionAvailable();
  } catch {
    return false;
  }
};

export interface SpeechHandlers {
  onText: (text: string, isFinal: boolean) => void;
  onEnd: () => void;
  onError: (message: string) => void;
}

/** Starts Russian dictation. Returns a stop function. */
export async function startDictation(h: SpeechHandlers): Promise<() => void> {
  if (!mod) throw new Error('Распознавание речи недоступно в этой сборке');
  const perm = await mod.requestPermissionsAsync();
  if (!perm.granted) throw new Error('Нет доступа к микрофону');

  const subs = [
    mod.addListener('result', (e) => h.onText(e.results[0]?.transcript ?? '', e.isFinal)),
    mod.addListener('end', () => {
      subs.forEach((s) => s.remove());
      h.onEnd();
    }),
    mod.addListener('error', (e) => h.onError(e.message || e.error)),
  ];
  mod.start({ lang: 'ru-RU', interimResults: true, continuous: false, addsPunctuation: true });
  return () => mod?.stop();
}
