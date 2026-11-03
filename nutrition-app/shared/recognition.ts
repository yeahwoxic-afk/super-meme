/**
 * Shared AI-recognition contract: the instructions given to Claude and the
 * post-processing of its answer. Used by the server (Claude API) and by the
 * in-Claude web build (artifact `sample` capability), so both behave the same.
 */
import { buildFoodItem, sumMacros } from './nutrition';
import type { Macros, RecognitionResult } from './types';

export const RECOGNITION_INSTRUCTIONS = `Ты — нутрициолог-ассистент в приложении подсчёта калорий.
Задача: определить продукты и блюда и оценить их пищевую ценность.

Правила:
- Разбивай приём пищи на отдельные позиции (гарнир, мясо, соус, напиток — отдельно).
- Для каждой позиции укажи пищевую ценность НА 100 г (ккал, белки, жиры, углеводы) по типичным справочным данным (USDA, Скурихин) и оцени вес съедобной порции в граммах.
- Вес оценивай по размеру тарелки, столовых приборов, упаковки; если пользователь назвал вес или количество (штуки, ложки, стаканы) — пересчитай в граммы.
- Если на фото этикетка с таблицей пищевой ценности — используй цифры с этикетки; вес порции — масса упаковки или указанная порция.
- Учитывай способ приготовления (жарка добавляет масло).
- Если еды нет или распознать нельзя — верни пустой список items и объясни в note.
- confidence: 0.9+ если блюдо и порция очевидны, 0.5–0.8 если порция примерная, ниже — если сомневаешься.
- Названия пиши по-русски, коротко.`;

/** Output format, for callers that cannot enforce a schema (e.g. `sample.json`). */
export const RECOGNITION_JSON_FORMAT = `Ответь ТОЛЬКО JSON-объектом такого вида, без пояснений:
{"items":[{"name":"Гречка отварная","grams":180,"per100g":{"calories":110,"protein":4.2,"fat":1.1,"carbs":21.3},"confidence":0.8}],"note":""}
note — одно короткое предложение по-русски о сделанных допущениях или пустая строка.`;

export const photoPrompt = (hint?: string) =>
  hint?.trim() ? `Определи еду на фото. Уточнение от пользователя: ${hint.trim()}` : 'Определи еду на фото.';

export const textPrompt = (description: string) =>
  `Пользователь описал, что съел (текст или расшифровка голоса):\n"""${description}"""`;

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Turns a model answer (already JSON-parsed, shape not trusted) into a
 * consistent RecognitionResult: drops empty/zero-gram items, clamps values,
 * fixes calories that contradict macros and computes totals in code.
 */
export function normalizeRecognition(raw: unknown): RecognitionResult {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as { items?: unknown; note?: unknown };
  const list = Array.isArray(obj.items) ? obj.items : [];
  const items = list.flatMap((it) => {
    if (!it || typeof it !== 'object') return [];
    const r = it as { name?: unknown; grams?: unknown; per100g?: unknown; confidence?: unknown };
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    const grams = Math.round(num(r.grams));
    if (!name || grams <= 0) return [];
    const p = (r.per100g && typeof r.per100g === 'object' ? r.per100g : {}) as Record<string, unknown>;
    const per100g: Macros = {
      calories: Math.max(0, num(p.calories)),
      protein: Math.max(0, num(p.protein)),
      fat: Math.max(0, num(p.fat)),
      carbs: Math.max(0, num(p.carbs)),
    };
    const confidence = r.confidence == null ? 0.7 : Math.min(1, Math.max(0, num(r.confidence)));
    return [buildFoodItem(name.slice(0, 80), grams, per100g, confidence)];
  });
  const note = typeof obj.note === 'string' && obj.note.trim() ? obj.note.trim() : undefined;
  return { items, totals: sumMacros(items), note };
}
