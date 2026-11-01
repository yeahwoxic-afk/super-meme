/**
 * Client for the NutriAI service (../server). The Anthropic API key lives only
 * on the server; the app talks to it over HTTPS.
 *
 * Configure with EXPO_PUBLIC_API_URL (and optionally EXPO_PUBLIC_API_TOKEN).
 */
import {
  normalizeRecognition,
  photoPrompt,
  RECOGNITION_INSTRUCTIONS,
  RECOGNITION_JSON_FORMAT,
  textPrompt,
} from '../../shared/recognition';
import type { FoodItem, RecognitionResult } from '../../shared/types';
import { inClaude, useCapability, type SampleError, type SampleFn } from './runtime';

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787').replace(/\/$/, '');
const TOKEN = process.env.EXPO_PUBLIC_API_TOKEN;

export interface BarcodeProduct {
  barcode: string;
  name: string;
  brand?: string;
  item: FoodItem;
  servingGrams: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 60_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
        ...init.headers,
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(errorMessage(res.status, body), res.status);
    return body as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('Нет связи с сервером. Проверьте интернет.', 0);
  } finally {
    clearTimeout(timer);
  }
}

function errorMessage(status: number, body: { message?: string }): string {
  if (status === 404) return 'Продукт не найден';
  if (status === 401) return 'Нет доступа к сервису';
  if (status === 422) return 'Не удалось распознать — попробуйте другое фото или описание';
  return body.message ?? 'Ошибка сервиса, попробуйте ещё раз';
}

/* ---------- In-Claude backend (artifact `sample` capability) ---------- */

function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64.slice(b64.indexOf('base64,') >= 0 ? b64.indexOf('base64,') + 7 : 0));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

const SAMPLE_ERRORS: Record<string, string> = {
  not_granted: 'Разрешите приложению обращаться к Claude, чтобы распознавать еду',
  sampling_disabled: 'Claude недоступен для этого аккаунта',
  rate_limited: 'Слишком много запросов — подождите немного и попробуйте снова',
  session_expired: 'Войдите в Claude заново',
  image_rejected: 'Это фото не подошло — попробуйте другое (JPEG или PNG)',
  images_unavailable: 'Здесь нельзя отправить фото — опишите еду текстом',
  refused: 'Не удалось распознать — попробуйте другое фото или описание',
  invalid_json: 'ИИ ответил неразборчиво — попробуйте ещё раз',
};

async function recognizeViaClaude(prompt: string, imageBase64?: string): Promise<RecognitionResult> {
  const sample = await useCapability<SampleFn>('sample');
  if (!sample) throw new ApiError('ИИ-распознавание недоступно в этом окне. Откройте приложение в Claude.', 0);
  try {
    const raw = await sample.json(`${RECOGNITION_INSTRUCTIONS}\n\n${prompt}\n\n${RECOGNITION_JSON_FORMAT}`, {
      images: imageBase64 ? [base64ToBlob(imageBase64, 'image/jpeg')] : undefined,
      modelTier: 'default',
      effort: 'low',
    });
    return normalizeRecognition(raw);
  } catch (e) {
    const code = (e as SampleError)?.code;
    throw new ApiError(SAMPLE_ERRORS[code] ?? 'ИИ временно недоступен, попробуйте ещё раз', 0);
  }
}

/* ---------- Public API: picks the backend for the current runtime ---------- */

export const api = {
  recognizePhoto: (imageBase64: string, hint?: string) =>
    inClaude()
      ? recognizeViaClaude(photoPrompt(hint), imageBase64)
      : call<RecognitionResult>('/api/recognize/photo', {
          method: 'POST',
          body: JSON.stringify({ imageBase64, mediaType: 'image/jpeg', hint }),
        }),
  recognizeText: (text: string) =>
    inClaude()
      ? recognizeViaClaude(textPrompt(text))
      : call<RecognitionResult>('/api/recognize/text', { method: 'POST', body: JSON.stringify({ text }) }),
  barcode: (code: string) => call<BarcodeProduct>(`/api/barcode/${encodeURIComponent(code)}`, {}, 15_000),
};
