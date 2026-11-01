/**
 * AI food recognition backed by Claude.
 *
 * The model returns per-100 g nutrition plus an estimated portion for each
 * item; the server then rebuilds absolute macros with `buildFoodItem`, which
 * also repairs calorie values that disagree with the macros. Doing the
 * arithmetic in code (not in the model) keeps totals exact and consistent.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { buildFoodItem, sumMacros } from '../../shared/nutrition';
import type { RecognitionResult } from '../../shared/types';

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

/** Abstraction so routes can be tested without calling the real API. */
export interface FoodRecognizer {
  fromPhoto(imageBase64: string, mediaType: ImageMediaType, hint?: string): Promise<RecognitionResult>;
  fromText(description: string): Promise<RecognitionResult>;
}

export class RecognitionRefusedError extends Error {}

const Per100g = z.object({
  calories: z.number().describe('kcal per 100 g'),
  protein: z.number().describe('grams of protein per 100 g'),
  fat: z.number().describe('grams of fat per 100 g'),
  carbs: z.number().describe('grams of carbohydrates per 100 g'),
});

export const AiRecognitionSchema = z.object({
  items: z.array(
    z.object({
      name: z.string().describe('Dish or product name in Russian, short'),
      grams: z.number().describe('Estimated edible portion weight in grams'),
      per100g: Per100g,
      confidence: z.number().describe('0..1 confidence in identification and portion'),
    }),
  ),
  note: z.string().describe('One short sentence in Russian: assumptions made, or empty string'),
});
export type AiRecognition = z.infer<typeof AiRecognitionSchema>;

export const SYSTEM_PROMPT = `Ты — нутрициолог-ассистент в приложении подсчёта калорий.
Задача: определить продукты и блюда и оценить их пищевую ценность.

Правила:
- Разбивай приём пищи на отдельные позиции (гарнир, мясо, соус, напиток — отдельно).
- Для каждой позиции укажи пищевую ценность НА 100 г (ккал, белки, жиры, углеводы) по типичным справочным данным (USDA, Скурихин) и оцени вес съедобной порции в граммах.
- Вес оценивай по размеру тарелки, столовых приборов, упаковки; если пользователь назвал вес или количество (штуки, ложки, стаканы) — пересчитай в граммы.
- Если на фото этикетка с таблицей пищевой ценности — используй цифры с этикетки.
- Учитывай способ приготовления (жарка добавляет масло).
- Если еды нет или распознать нельзя — верни пустой список items и объясни в note.
- confidence: 0.9+ если блюдо и порция очевидны, 0.5–0.8 если порция примерная, ниже — если сомневаешься.
- Названия пиши по-русски, коротко.`;

function toResult(ai: AiRecognition): RecognitionResult {
  const items = ai.items
    .filter((i) => i.grams > 0)
    .map((i) =>
      buildFoodItem(i.name.trim(), Math.round(i.grams), i.per100g, Math.min(1, Math.max(0, i.confidence))),
    );
  return { items, totals: sumMacros(items), note: ai.note || undefined };
}

export interface ClaudeRecognizerOptions {
  model?: string;
  effort?: 'low' | 'medium' | 'high';
}

export class ClaudeFoodRecognizer implements FoodRecognizer {
  private readonly model: string;
  private readonly effort: 'low' | 'medium' | 'high';

  constructor(
    private readonly client: Anthropic,
    opts: ClaudeRecognizerOptions = {},
  ) {
    this.model = opts.model ?? 'claude-opus-5-5';
    // Recognition is a quick perception task; low effort keeps latency down.
    this.effort = opts.effort ?? 'low';
  }

  fromPhoto(imageBase64: string, mediaType: ImageMediaType, hint?: string) {
    return this.run([
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
      {
        type: 'text',
        text: hint?.trim()
          ? `Определи еду на фото. Уточнение от пользователя: ${hint.trim()}`
          : 'Определи еду на фото.',
      },
    ]);
  }

  fromText(description: string) {
    return this.run([
      { type: 'text', text: `Пользователь описал, что съел (текст или расшифровка голоса):\n"""${description}"""` },
    ]);
  }

  private async run(content: Anthropic.Beta.BetaContentBlockParam[]): Promise<RecognitionResult> {
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      // Server-side fallback: if a safety classifier declines, the API reroutes
      // the request to a suitable model instead of failing.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: this.effort, format: betaZodOutputFormat(AiRecognitionSchema) },
      messages: [{ role: 'user', content }],
    });

    if (response.stop_reason === 'refusal') {
      throw new RecognitionRefusedError('Модель отказалась обрабатывать запрос');
    }
    if (!response.parsed_output) {
      throw new Error(`Не удалось разобрать ответ модели (stop_reason=${response.stop_reason})`);
    }
    return toResult(response.parsed_output);
  }
}

export const __test = { toResult };
