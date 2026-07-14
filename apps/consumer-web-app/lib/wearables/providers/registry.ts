/**
 * Provider registry for the Wearable Integration Layer — same shape as
 * lib/body-assessment/providers/registry.ts. Every entry is an
 * UnconfiguredProvider stub: calling fetchDailyMetrics() throws a clear,
 * typed error rather than silently fabricating metrics. Wiring a real
 * provider means replacing one entry in this map with a real
 * implementation of WearableProvider — nothing else in lib/wearables/ or
 * app/actions/wearables.ts changes.
 */

import type { WearableProviderName } from '@mef/shared-types-contracts';
import type {
  WearableProvider,
  FetchWearableDailyMetricsRequest,
  WearableDailyMetricResult,
} from './types';

export const WEARABLE_PROVIDER_NAMES = ['oura', 'apple_health', 'google_fit'] as const;

class UnconfiguredWearableProvider implements WearableProvider {
  constructor(public readonly name: string) {}

  async fetchDailyMetrics(
    _request: FetchWearableDailyMetricsRequest
  ): Promise<WearableDailyMetricResult[]> {
    throw new Error(
      `Wearable provider "${this.name}" is not configured. This milestone builds the wearable ` +
        'integration layer and provider abstraction only — no real Oura/Apple Health/Google Fit ' +
        'API is wired to a real account yet.'
    );
  }
}

const PROVIDERS: Record<WearableProviderName, WearableProvider> = Object.fromEntries(
  WEARABLE_PROVIDER_NAMES.map((name) => [name, new UnconfiguredWearableProvider(name)])
) as Record<WearableProviderName, WearableProvider>;

export function getWearableProvider(name: WearableProviderName): WearableProvider {
  return PROVIDERS[name];
}

/** Registers or swaps a provider implementation at runtime — this, not an if/else on provider name, is how a real integration (or a test double) gets wired in without touching any calling code. */
export function registerWearableProvider(
  name: WearableProviderName,
  provider: WearableProvider
): void {
  PROVIDERS[name] = provider;
}

const ENV_VAR_BY_PROVIDER: Record<WearableProviderName, string> = {
  oura: 'OURA_CLIENT_ID',
  apple_health: 'APPLE_HEALTH_CLIENT_ID',
  google_fit: 'GOOGLE_FIT_CLIENT_ID',
};

/**
 * Whether a given provider is actually configured for this deployment —
 * callers (the connect/sync actions) treat 'not_configured' as an honest,
 * expected state, never as an error. No hardcoded default: same
 * discipline as lib/body-assessment/providers/registry.ts's
 * resolveConfiguredBodyAssessmentProvider.
 */
export function isWearableProviderConfigured(name: WearableProviderName): boolean {
  return Boolean(process.env[ENV_VAR_BY_PROVIDER[name]]);
}
