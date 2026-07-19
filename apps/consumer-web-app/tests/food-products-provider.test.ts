import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  normalizeOffProduct,
  OpenFoodFactsProvider,
} from '../lib/food-products/providers/openFoodFacts';

describe('normalizeOffProduct', () => {
  it('normalizes a complete Open Food Facts product without fabricating fields', () => {
    const normalized = normalizeOffProduct('012345678905', 'upc_a', {
      product_name: 'Crunchy Granola Bar',
      brands: 'Acme',
      image_front_url: 'https://example.test/image.jpg',
      serving_size: '35 g',
      nutrition_data_per: 'serving',
      nutriments: {
        'energy-kcal_serving': 150,
        proteins_serving: 4,
        carbohydrates_serving: 20,
        fiber_serving: 3,
        sugars_serving: 8,
        fat_serving: 6,
        'saturated-fat_serving': 1,
        'trans-fat_serving': 0,
        sodium_serving: 0.12,
        potassium_serving: 0.08,
      },
      ingredients_text: 'oats, honey, almonds, sea salt',
      ingredients: [{ text: 'oats' }, { text: 'honey' }, { text: 'almonds' }, { text: 'sea salt' }],
      additives_tags: [],
      allergens_tags: ['en:nuts'],
      traces_tags: ['en:milk'],
      nutriscore_grade: 'b',
      code: '012345678905',
    });

    expect(normalized.name).toBe('Crunchy Granola Bar');
    expect(normalized.brand).toBe('Acme');
    expect(normalized.servingSizeGrams).toBe(35);
    expect(normalized.nutrients?.basis).toBe('per_serving');
    expect(normalized.nutrients?.calories).toBe(150);
    expect(normalized.nutrients?.sodiumMg).toBe(120);
    expect(normalized.nutrients?.potassiumMg).toBe(80);
    expect(normalized.allergens).toEqual([
      { allergen: 'nuts', kind: 'contains' },
      { allergen: 'milk', kind: 'may_contain' },
    ]);
    expect(normalized.dataCompleteness).toBe('complete');
  });

  it('falls back to per-100g nutrients when no serving-basis values are reported', () => {
    const normalized = normalizeOffProduct('4006381333931', 'ean_13', {
      product_name: 'Plain Yogurt',
      nutriments: {
        energy_100g: 60,
        'energy-kcal_100g': 60,
        proteins_100g: 5,
        carbohydrates_100g: 4,
        fat_100g: 3,
      },
    });
    expect(normalized.nutrients?.basis).toBe('per_100g');
    expect(normalized.nutrients?.calories).toBe(60);
  });

  it('reports minimal data completeness and leaves fields null when the product has almost no data', () => {
    const normalized = normalizeOffProduct('73513537', 'ean_8', { code: '73513537' });
    expect(normalized.name).toBeNull();
    expect(normalized.nutrients?.calories ?? null).toBeNull();
    expect(normalized.ingredientsText).toBeNull();
    expect(normalized.dataCompleteness).toBe('minimal');
  });

  it('never invents an allergen or ingredient that was not present in the source response', () => {
    const normalized = normalizeOffProduct('73513537', 'ean_8', {
      product_name: 'Mystery Snack',
      nutriments: { 'energy-kcal_100g': 400 },
    });
    expect(normalized.allergens).toEqual([]);
    expect(normalized.ingredientsList).toEqual([]);
    expect(normalized.ingredientsText).toBeNull();
  });
});

describe('OpenFoodFactsProvider network behavior', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null (never fabricates) when the product is genuinely not found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 0 }) })
    );
    const provider = new OpenFoodFactsProvider();
    const result = await provider.lookupByBarcode('000000000000');
    expect(result).toBeNull();
  });

  it('returns the normalized product on a successful lookup', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 1,
          product: { product_name: 'Test Product', code: '012345678905' },
        }),
      })
    );
    const provider = new OpenFoodFactsProvider();
    const result = await provider.lookupByBarcode('012345678905');
    expect(result?.name).toBe('Test Product');
  });

  it('retries on a 500 and eventually throws when every attempt fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503, text: async () => 'unavailable' });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenFoodFactsProvider(1000);
    await expect(provider.lookupByBarcode('012345678905')).rejects.toThrow();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it('surfaces a timeout as a clear error rather than hanging', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: { signal: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          );
        });
      })
    );
    const provider = new OpenFoodFactsProvider(50);
    await expect(provider.lookupByBarcode('012345678905')).rejects.toThrow(/timed out/i);
  });

  it('does not retry a genuine network failure indefinitely', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Network request failed'));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenFoodFactsProvider(1000);
    await expect(provider.lookupByBarcode('012345678905')).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
