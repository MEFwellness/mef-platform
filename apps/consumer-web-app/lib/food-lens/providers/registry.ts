/**
 * Provider registry for Food Lens — same shape as
 * lib/body-assessment/providers/registry.ts. Named stub entries other than
 * 'anthropic_vision' stay UnconfiguredFoodLensProvider so a future
 * bake-off (doc 2 §2.1's alternatives table) has somewhere to register a
 * real implementation without touching any calling code.
 */

import type { FoodLensProvider, FoodLensAnalysisRequest, FoodLensAnalysisResult } from './types';
import { buildAnthropicFoodLensProviderFromEnv } from './anthropicVision';

export const FOOD_LENS_PROVIDER_NAMES = [
  'anthropic_vision',
  'openai_vision',
  'google_gemini',
] as const;

export type FoodLensProviderName = (typeof FOOD_LENS_PROVIDER_NAMES)[number];

class UnconfiguredFoodLensProvider implements FoodLensProvider {
  constructor(public readonly name: string) {}

  async analyzeMeal(_request: FoodLensAnalysisRequest): Promise<FoodLensAnalysisResult> {
    throw new Error(
      `Food Lens provider "${this.name}" is not configured. No vision provider is wired to a real ` +
        'API for this deployment yet — never fabricating detected items or a macro estimate.'
    );
  }
}

const PROVIDERS: Record<FoodLensProviderName, FoodLensProvider> = Object.fromEntries(
  FOOD_LENS_PROVIDER_NAMES.map((name) => [name, new UnconfiguredFoodLensProvider(name)])
) as Record<FoodLensProviderName, FoodLensProvider>;

let anthropicRegistered = false;
let loggedMissingConfig = false;

/** Lazily registers the real Anthropic vision provider the first time it's asked for, mirroring lib/conversation-coach/provider.ts's registration pattern — env vars are only read once configuration is actually needed, not at module load. */
function ensureAnthropicRegistered(): void {
  if (anthropicRegistered) return;
  const real = buildAnthropicFoodLensProviderFromEnv();
  if (real) {
    PROVIDERS.anthropic_vision = real;
    anthropicRegistered = true;
    return;
  }
  if (!loggedMissingConfig) {
    console.error(
      'Food Lens: no vision provider configured — missing ANTHROPIC_API_KEY/ANTHROPIC_MODEL. ' +
        'Scans will be left in "not_configured" state until these are set.'
    );
    loggedMissingConfig = true;
  }
}

export function getFoodLensProvider(name: FoodLensProviderName): FoodLensProvider {
  if (name === 'anthropic_vision') ensureAnthropicRegistered();
  return PROVIDERS[name];
}

/** Registers or swaps a provider implementation at runtime — how a real integration (or a test double) gets wired in without touching any calling code. */
export function registerFoodLensProvider(
  name: FoodLensProviderName,
  provider: FoodLensProvider
): void {
  PROVIDERS[name] = provider;
}

/**
 * Which provider is actually configured for this deployment, or null if
 * none is — callers treat null as "leave this scan in not_configured
 * state," never as an error. Defaults to 'anthropic_vision' when its env
 * vars are present, same "no hardcoded default beyond what's actually
 * configured" discipline as resolveConfiguredBodyAssessmentProvider.
 */
export function resolveConfiguredFoodLensProvider(): FoodLensProviderName | null {
  const explicit = process.env.FOOD_LENS_PROVIDER;
  if (explicit && (FOOD_LENS_PROVIDER_NAMES as readonly string[]).includes(explicit)) {
    return explicit as FoodLensProviderName;
  }
  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL) return 'anthropic_vision';
  return null;
}
