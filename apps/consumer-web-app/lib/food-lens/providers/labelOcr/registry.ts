/**
 * Provider registry for Nutrition Facts label OCR — same shape as
 * ../registry.ts (the meal-photo Food Lens provider registry). Named stub
 * entries other than 'anthropic_label_ocr' stay UnconfiguredFoodLabelOcrProvider
 * so a future dedicated OCR API can register a real implementation without
 * touching any calling code.
 */

import type { FoodLabelOcrProvider, FoodLabelOcrRequest, FoodLabelOcrResult } from './types';
import { buildAnthropicFoodLabelOcrProviderFromEnv } from './anthropicLabelOcr';

export const FOOD_LABEL_OCR_PROVIDER_NAMES = ['anthropic_label_ocr', 'dedicated_ocr_api'] as const;

export type FoodLabelOcrProviderName = (typeof FOOD_LABEL_OCR_PROVIDER_NAMES)[number];

class UnconfiguredFoodLabelOcrProvider implements FoodLabelOcrProvider {
  constructor(public readonly name: string) {}

  async extractLabel(_request: FoodLabelOcrRequest): Promise<FoodLabelOcrResult> {
    throw new Error(
      `Food Label OCR provider "${this.name}" is not configured. No OCR provider is wired to a real ` +
        'API for this deployment yet — never fabricating extracted label values.'
    );
  }
}

const PROVIDERS: Record<FoodLabelOcrProviderName, FoodLabelOcrProvider> = Object.fromEntries(
  FOOD_LABEL_OCR_PROVIDER_NAMES.map((name) => [name, new UnconfiguredFoodLabelOcrProvider(name)])
) as Record<FoodLabelOcrProviderName, FoodLabelOcrProvider>;

let anthropicRegistered = false;
let loggedMissingConfig = false;

function ensureAnthropicRegistered(): void {
  if (anthropicRegistered) return;
  const real = buildAnthropicFoodLabelOcrProviderFromEnv();
  if (real) {
    PROVIDERS.anthropic_label_ocr = real;
    anthropicRegistered = true;
    return;
  }
  if (!loggedMissingConfig) {
    console.error(
      'Food Label OCR: no provider configured — missing ANTHROPIC_API_KEY/ANTHROPIC_MODEL. ' +
        'Label scans will be left in "not_configured" state until these are set.'
    );
    loggedMissingConfig = true;
  }
}

export function getFoodLabelOcrProvider(name: FoodLabelOcrProviderName): FoodLabelOcrProvider {
  if (name === 'anthropic_label_ocr') ensureAnthropicRegistered();
  return PROVIDERS[name];
}

export function registerFoodLabelOcrProvider(
  name: FoodLabelOcrProviderName,
  provider: FoodLabelOcrProvider
): void {
  PROVIDERS[name] = provider;
}

/** Which provider is actually configured, or null — callers treat null as "leave this scan not_configured," never as an error. */
export function resolveConfiguredFoodLabelOcrProvider(): FoodLabelOcrProviderName | null {
  const explicit = process.env.FOOD_LABEL_OCR_PROVIDER;
  if (explicit && (FOOD_LABEL_OCR_PROVIDER_NAMES as readonly string[]).includes(explicit)) {
    return explicit as FoodLabelOcrProviderName;
  }
  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL) return 'anthropic_label_ocr';
  return null;
}
