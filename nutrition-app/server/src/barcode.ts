/** Barcode lookup via the Open Food Facts public database (no key needed). */
import { buildFoodItem } from '../../shared/nutrition';
import type { FoodItem } from '../../shared/types';

export interface BarcodeProduct {
  barcode: string;
  name: string;
  brand?: string;
  item: FoodItem;
  /** Suggested portion in grams (serving size or 100 g). */
  servingGrams: number;
}

export interface BarcodeLookup {
  lookup(code: string): Promise<BarcodeProduct | null>;
}

type FetchFn = typeof fetch;

interface OffNutriments {
  'energy-kcal_100g'?: number;
  energy_100g?: number; // kJ
  proteins_100g?: number;
  fat_100g?: number;
  carbohydrates_100g?: number;
}

interface OffResponse {
  status: number;
  product?: {
    product_name?: string;
    product_name_ru?: string;
    brands?: string;
    serving_quantity?: number | string;
    nutriments?: OffNutriments;
  };
}

export const isValidBarcode = (code: string) => /^\d{8,14}$/.test(code);

export class OpenFoodFactsLookup implements BarcodeLookup {
  constructor(
    private readonly fetchFn: FetchFn = fetch,
    private readonly baseUrl = 'https://world.openfoodfacts.org',
  ) {}

  async lookup(code: string): Promise<BarcodeProduct | null> {
    if (!isValidBarcode(code)) return null;
    const url = `${this.baseUrl}/api/v2/product/${code}.json?fields=product_name,product_name_ru,brands,serving_quantity,nutriments`;
    const res = await this.fetchFn(url, { headers: { 'User-Agent': 'NutriAI/1.0 (calorie tracker)' } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Open Food Facts HTTP ${res.status}`);
    const data = (await res.json()) as OffResponse;
    if (data.status !== 1 || !data.product) return null;
    return parseOffProduct(code, data.product);
  }
}

export function parseOffProduct(code: string, p: NonNullable<OffResponse['product']>): BarcodeProduct | null {
  const n = p.nutriments ?? {};
  const kcal = n['energy-kcal_100g'] ?? (n.energy_100g != null ? n.energy_100g / 4.184 : undefined);
  if (kcal == null && n.proteins_100g == null) return null;

  const name = (p.product_name_ru || p.product_name || 'Продукт').trim();
  const serving = Number(p.serving_quantity);
  const servingGrams = Number.isFinite(serving) && serving > 0 ? Math.round(serving) : 100;
  const per100g = {
    calories: kcal ?? 0,
    protein: n.proteins_100g ?? 0,
    fat: n.fat_100g ?? 0,
    carbs: n.carbohydrates_100g ?? 0,
  };
  return {
    barcode: code,
    name,
    brand: p.brands?.split(',')[0]?.trim() || undefined,
    servingGrams,
    item: buildFoodItem(name, servingGrams, per100g, 1),
  };
}
