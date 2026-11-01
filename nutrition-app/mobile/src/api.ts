/**
 * Client for the NutriAI service (../server). The Anthropic API key lives only
 * on the server; the app talks to it over HTTPS.
 *
 * Configure with EXPO_PUBLIC_API_URL (and optionally EXPO_PUBLIC_API_TOKEN).
 */
import type { FoodItem, RecognitionResult } from '../../shared/types';

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

export const api = {
  recognizePhoto: (imageBase64: string, hint?: string) =>
    call<RecognitionResult>('/api/recognize/photo', {
      method: 'POST',
      body: JSON.stringify({ imageBase64, mediaType: 'image/jpeg', hint }),
    }),
  recognizeText: (text: string) =>
    call<RecognitionResult>('/api/recognize/text', { method: 'POST', body: JSON.stringify({ text }) }),
  barcode: (code: string) => call<BarcodeProduct>(`/api/barcode/${encodeURIComponent(code)}`, {}, 15_000),
};
