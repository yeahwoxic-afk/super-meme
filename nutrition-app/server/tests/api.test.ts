import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { buildFoodItem, sumMacros } from '../../shared/nutrition';
import type { RecognitionResult } from '../../shared/types';
import { normalizeRecognition } from '../../shared/recognition';
import { RecognitionRefusedError, type FoodRecognizer } from '../src/ai';
import { createApp } from '../src/app';
import { OpenFoodFactsLookup, parseOffProduct, type BarcodeLookup } from '../src/barcode';

const item = buildFoodItem('Гречка', 200, { calories: 110, protein: 4.2, fat: 1.1, carbs: 21.3 }, 0.9);
const sample: RecognitionResult = { items: [item], totals: sumMacros([item]) };

function makeApp(over: Partial<{ recognizer: FoodRecognizer; barcode: BarcodeLookup; apiToken: string }> = {}) {
  const recognizer: FoodRecognizer = over.recognizer ?? {
    fromPhoto: vi.fn().mockResolvedValue(sample),
    fromText: vi.fn().mockResolvedValue(sample),
  };
  const barcode: BarcodeLookup = over.barcode ?? { lookup: vi.fn().mockResolvedValue(null) };
  return { app: createApp({ recognizer, barcode, apiToken: over.apiToken, logger: { error: () => {} } }), recognizer, barcode };
}

describe('POST /api/recognize/photo', () => {
  it('passes base64 (data-URL prefix stripped) to the recognizer', async () => {
    const { app, recognizer } = makeApp();
    const data = 'A'.repeat(200);
    const res = await request(app)
      .post('/api/recognize/photo')
      .send({ imageBase64: `data:image/jpeg;base64,${data}`, hint: 'без соуса' });
    expect(res.status).toBe(200);
    expect(res.body.totals.calories).toBe(220);
    expect(recognizer.fromPhoto).toHaveBeenCalledWith(data, 'image/jpeg', 'без соуса');
  });

  it('rejects a missing image', async () => {
    const { app } = makeApp();
    expect((await request(app).post('/api/recognize/photo').send({})).status).toBe(400);
  });

  it('maps a refusal to 422 and upstream failures to 502', async () => {
    const refused = makeApp({
      recognizer: { fromPhoto: vi.fn().mockRejectedValue(new RecognitionRefusedError('no')), fromText: vi.fn() },
    });
    expect((await request(refused.app).post('/api/recognize/photo').send({ imageBase64: 'A'.repeat(200) })).status).toBe(422);
    const broken = makeApp({ recognizer: { fromPhoto: vi.fn(), fromText: vi.fn().mockRejectedValue(new Error('x')) } });
    expect((await request(broken.app).post('/api/recognize/text').send({ text: 'борщ' })).status).toBe(502);
  });
});

describe('POST /api/recognize/text', () => {
  it('recognizes a voice transcript', async () => {
    const { app, recognizer } = makeApp();
    const res = await request(app).post('/api/recognize/text').send({ text: 'тарелка гречки с котлетой' });
    expect(res.status).toBe(200);
    expect(recognizer.fromText).toHaveBeenCalledWith('тарелка гречки с котлетой');
  });
});

describe('GET /api/barcode/:code', () => {
  it('validates the code', async () => {
    const { app } = makeApp();
    expect((await request(app).get('/api/barcode/abc')).status).toBe(400);
  });
  it('returns 404 when unknown', async () => {
    const { app } = makeApp();
    expect((await request(app).get('/api/barcode/4600000000000')).status).toBe(404);
  });
});

describe('auth token', () => {
  it('requires the bearer token when configured', async () => {
    const { app } = makeApp({ apiToken: 's3cret' });
    expect((await request(app).post('/api/recognize/text').send({ text: 'яблоко' })).status).toBe(401);
    const ok = await request(app).post('/api/recognize/text').set('Authorization', 'Bearer s3cret').send({ text: 'яблоко' });
    expect(ok.status).toBe(200);
  });
  it('leaves /health open', async () => {
    const { app } = makeApp({ apiToken: 's3cret' });
    expect((await request(app).get('/health')).status).toBe(200);
  });
});

describe('POST /api/targets', () => {
  it('computes targets from a profile', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/targets').send({
      sex: 'female', age: 32, heightCm: 168, weightKg: 70, activity: 'light', goal: 'lose', onGlp1: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.protein).toBe(126); // 1.8 g/kg * 70
    expect(res.body.calories).toBeGreaterThan(1200);
  });
});

describe('AI output post-processing', () => {
  it('drops zero-gram items, clamps confidence and computes totals', () => {
    const r = normalizeRecognition({
      items: [
        { name: ' Борщ ', grams: 300, per100g: { calories: 50, protein: 2.5, fat: 2, carbs: 5.5 }, confidence: 1.4 },
        { name: 'Ничего', grams: 0, per100g: { calories: 10, protein: 0, fat: 0, carbs: 2.5 }, confidence: 0.5 },
      ],
      note: '',
    });
    expect(r.items).toHaveLength(1);
    expect(r.items[0].name).toBe('Борщ');
    expect(r.items[0].confidence).toBe(1);
    expect(r.totals.calories).toBe(150);
    expect(r.note).toBeUndefined();
  });

  it('tolerates malformed model JSON (strings, missing fields, junk items)', () => {
    const r = normalizeRecognition({
      items: [
        { name: 'Яблоко', grams: '150', per100g: { calories: '52', protein: 0.3, fat: 0.2, carbs: 14 } },
        { grams: 100 },
        null,
        'мусор',
      ],
    });
    expect(r.items).toHaveLength(1);
    expect(r.items[0].calories).toBe(78);
    expect(r.items[0].confidence).toBe(0.7);
    expect(normalizeRecognition(null).items).toEqual([]);
  });
});

describe('Open Food Facts', () => {
  it('parses a product with serving size', () => {
    const p = parseOffProduct('4607001771456', {
      product_name: 'Yogurt',
      product_name_ru: 'Йогурт',
      brands: 'Danone, Other',
      serving_quantity: '125',
      nutriments: { 'energy-kcal_100g': 75, proteins_100g: 4.5, fat_100g: 2.5, carbohydrates_100g: 8.5 },
    })!;
    expect(p.name).toBe('Йогурт');
    expect(p.brand).toBe('Danone');
    expect(p.servingGrams).toBe(125);
    expect(p.item.calories).toBe(94);
  });

  it('converts kJ when kcal is missing', () => {
    const p = parseOffProduct('12345678', { product_name: 'X', nutriments: { energy_100g: 418.4, proteins_100g: 0, fat_100g: 0, carbohydrates_100g: 25 } })!;
    expect(p.item.per100g.calories).toBe(100);
  });

  it('uses an injected fetch and handles status 0 as not found', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 0 }), { status: 200 }));
    const off = new OpenFoodFactsLookup(fetchFn as unknown as typeof fetch, 'https://example.test');
    expect(await off.lookup('4600000000000')).toBeNull();
    expect(fetchFn.mock.calls[0][0]).toContain('https://example.test/api/v2/product/4600000000000.json');
  });
});
