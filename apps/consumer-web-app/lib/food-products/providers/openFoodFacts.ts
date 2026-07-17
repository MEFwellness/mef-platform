/**
 * The Open Food Facts provider — the initial (and free, no-API-key) packaged
 * food data source, per product requirement §2. Talks to the public v2 REST
 * API directly over fetch, same retry/timeout discipline as
 * lib/food-lens/providers/anthropicVision.ts. Every field on the returned
 * NormalizedFoodProduct is either a real value from the response or an
 * honest null — this file must never invent a nutrient, ingredient, or
 * allergen that Open Food Facts didn't actually report.
 */

import type {
  AllergenMatch,
  BarcodeType,
  DataCompleteness,
  NormalizedFoodProduct,
  NutrientBasis,
} from '@mef/shared-types-contracts';
import type { FoodProductProvider } from './types';

const OFF_API_BASE = 'https://world.openfoodfacts.org/api/v2/product';
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

type OffNutriments = Record<string, number | string | undefined>;

type OffProduct = {
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  image_url?: string;
  image_front_url?: string;
  serving_size?: string;
  quantity?: string;
  nutrition_data_per?: string;
  nutriments?: OffNutriments;
  ingredients_text?: string;
  ingredients_text_en?: string;
  ingredients?: Array<{ text?: string; id?: string }>;
  additives_tags?: string[];
  allergens_tags?: string[];
  traces_tags?: string[];
  nutrition_grades?: string;
  nutriscore_grade?: string;
  code?: string;
};

type OffResponse = {
  status: number;
  status_verbose?: string;
  product?: OffProduct;
};

function num(value: number | string | undefined): number | null {
  if (value === undefined || value === null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Strips Open Food Facts' "en:milk" taxonomy prefix down to a plain allergen name. */
function stripTaxonomyPrefix(tag: string): string {
  const idx = tag.indexOf(':');
  return (idx >= 0 ? tag.slice(idx + 1) : tag).replace(/-/g, ' ').trim();
}

/** Reads a per-serving nutriment first, falling back to per-100g — the caller records which basis actually won via `basis`, never silently mixing the two within one product. */
function readNutrients(n: OffNutriments | undefined): {
  basis: NutrientBasis;
  calories: number | null;
  proteinG: number | null;
  totalCarbohydrateG: number | null;
  fiberG: number | null;
  totalSugarG: number | null;
  addedSugarG: number | null;
  totalFatG: number | null;
  saturatedFatG: number | null;
  monounsaturatedFatG: number | null;
  polyunsaturatedFatG: number | null;
  transFatG: number | null;
  sodiumMg: number | null;
  potassiumMg: number | null;
} {
  if (!n) {
    return {
      basis: 'per_serving',
      calories: null,
      proteinG: null,
      totalCarbohydrateG: null,
      fiberG: null,
      totalSugarG: null,
      addedSugarG: null,
      totalFatG: null,
      saturatedFatG: null,
      monounsaturatedFatG: null,
      polyunsaturatedFatG: null,
      transFatG: null,
      sodiumMg: null,
      potassiumMg: null,
    };
  }

  const hasServingBasis =
    num(n['energy-kcal_serving']) !== null || num(n['proteins_serving']) !== null;
  const suffix = hasServingBasis ? '_serving' : '_100g';
  const basis: NutrientBasis = hasServingBasis ? 'per_serving' : 'per_100g';

  // OFF reports sodium/potassium in grams; the app stores milligrams.
  const sodiumG = num(n[`sodium${suffix}`]);
  const potassiumG = num(n[`potassium${suffix}`]);

  return {
    basis,
    calories: num(n[`energy-kcal${suffix}`]),
    proteinG: num(n[`proteins${suffix}`]),
    totalCarbohydrateG: num(n[`carbohydrates${suffix}`]),
    fiberG: num(n[`fiber${suffix}`]),
    totalSugarG: num(n[`sugars${suffix}`]),
    addedSugarG: num(n[`added-sugars${suffix}`]),
    totalFatG: num(n[`fat${suffix}`]),
    saturatedFatG: num(n[`saturated-fat${suffix}`]),
    monounsaturatedFatG: num(n[`monounsaturated-fat${suffix}`]),
    polyunsaturatedFatG: num(n[`polyunsaturated-fat${suffix}`]),
    transFatG: num(n[`trans-fat${suffix}`]),
    sodiumMg: sodiumG === null ? null : sodiumG * 1000,
    potassiumMg: potassiumG === null ? null : potassiumG * 1000,
  };
}

const COMPLETENESS_FIELD_COUNT = 11;

function computeDataCompleteness(
  name: string | null,
  servingSizeText: string | null,
  ingredientsText: string | null,
  nutrients: ReturnType<typeof readNutrients>
): DataCompleteness {
  const present = [
    name,
    servingSizeText,
    ingredientsText,
    nutrients.calories,
    nutrients.proteinG,
    nutrients.totalCarbohydrateG,
    nutrients.fiberG,
    nutrients.totalSugarG,
    nutrients.totalFatG,
    nutrients.saturatedFatG,
    nutrients.sodiumMg,
  ].filter((v) => v !== null && v !== undefined && v !== '').length;

  const ratio = present / COMPLETENESS_FIELD_COUNT;
  if (ratio >= 0.9) return 'complete';
  if (ratio >= 0.5) return 'partial';
  return 'minimal';
}

export function normalizeOffProduct(
  barcode: string,
  barcodeType: BarcodeType,
  off: OffProduct
): NormalizedFoodProduct {
  const name = off.product_name_en || off.product_name || null;
  const servingSizeText = off.serving_size || null;
  const ingredientsText = off.ingredients_text_en || off.ingredients_text || null;
  const nutrients = readNutrients(off.nutriments);

  const allergens: AllergenMatch[] = [
    ...(off.allergens_tags ?? []).map((tag) => ({
      allergen: stripTaxonomyPrefix(tag),
      kind: 'contains' as const,
    })),
    ...(off.traces_tags ?? []).map((tag) => ({
      allergen: stripTaxonomyPrefix(tag),
      kind: 'may_contain' as const,
    })),
  ];

  const ingredientsList = (off.ingredients ?? [])
    .map((i) => i.text?.trim())
    .filter((t): t is string => Boolean(t && t.length > 0));

  const additives = (off.additives_tags ?? []).map(stripTaxonomyPrefix);

  // A serving-size string like "30 g (1 oz)" or "355ml" — extract the
  // leading grams figure when present; never guessed when the unit isn't
  // grams (e.g. a pure "ml" beverage serving has no gram weight to report).
  const gramsMatch = servingSizeText?.match(/(\d+(?:\.\d+)?)\s*g\b/i);
  const servingSizeGrams = gramsMatch ? Number(gramsMatch[1]) : null;

  return {
    barcode,
    barcodeType,
    dataSource: 'open_food_facts',
    sourceProductId: off.code ?? barcode,
    name,
    brand: off.brands ?? null,
    imageUrl: off.image_front_url || off.image_url || null,
    servingSizeText,
    servingSizeGrams,
    nutritionGrade: off.nutriscore_grade || off.nutrition_grades || null,
    dataCompleteness: computeDataCompleteness(name, servingSizeText, ingredientsText, nutrients),
    rawSourceData: off as unknown as Record<string, unknown>,
    nutrients: {
      basis: nutrients.basis,
      calories: nutrients.calories,
      proteinG: nutrients.proteinG,
      totalCarbohydrateG: nutrients.totalCarbohydrateG,
      fiberG: nutrients.fiberG,
      totalSugarG: nutrients.totalSugarG,
      addedSugarG: nutrients.addedSugarG,
      totalFatG: nutrients.totalFatG,
      saturatedFatG: nutrients.saturatedFatG,
      monounsaturatedFatG: nutrients.monounsaturatedFatG,
      polyunsaturatedFatG: nutrients.polyunsaturatedFatG,
      transFatG: nutrients.transFatG,
      sodiumMg: nutrients.sodiumMg,
      potassiumMg: nutrients.potassiumMg,
    },
    ingredientsText,
    ingredientsList,
    additives,
    allergens,
  };
}

export class OpenFoodFactsProvider implements FoodProductProvider {
  readonly name = 'open_food_facts';

  constructor(private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS) {}

  async lookupByBarcode(barcode: string): Promise<NormalizedFoodProduct | null> {
    const url = `${OFF_API_BASE}/${encodeURIComponent(barcode)}.json`;
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(url, {
          method: 'GET',
          // Open Food Facts asks integrators to identify themselves via
          // User-Agent — no API key required, this is a free/open database.
          headers: { 'User-Agent': 'MEF-Wellness-FoodLens/1.0 (contact: support@mefwellness.com)' },
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!response.ok) {
          if (isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS) {
            lastError = new Error(`Open Food Facts returned ${response.status}`);
            await sleep(RETRY_BASE_DELAY_MS * attempt);
            continue;
          }
          throw new Error(`Open Food Facts returned ${response.status}`);
        }

        const json = (await response.json()) as OffResponse;
        if (json.status !== 1 || !json.product) return null;

        return normalizeOffProduct(barcode, 'unknown', json.product);
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        const isAbort = err instanceof Error && err.name === 'AbortError';
        if (attempt < MAX_ATTEMPTS) {
          await sleep(RETRY_BASE_DELAY_MS * attempt);
          continue;
        }
        if (isAbort) {
          throw new Error(`Open Food Facts lookup timed out after ${this.timeoutMs}ms`);
        }
        throw err instanceof Error ? err : new Error('Open Food Facts lookup failed');
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Open Food Facts lookup failed');
  }
}
