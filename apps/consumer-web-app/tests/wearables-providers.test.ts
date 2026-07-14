import { describe, it, expect, afterEach } from 'vitest';
import {
  WEARABLE_PROVIDER_NAMES,
  getWearableProvider,
  registerWearableProvider,
  isWearableProviderConfigured,
} from '../lib/wearables/providers/registry';
import type {
  WearableProvider,
  FetchWearableDailyMetricsRequest,
  WearableDailyMetricResult,
} from '../lib/wearables/providers/types';

describe('WEARABLE_PROVIDER_NAMES', () => {
  it('includes every provider family the milestone names', () => {
    expect([...WEARABLE_PROVIDER_NAMES].sort()).toEqual(
      ['oura', 'apple_health', 'google_fit'].sort()
    );
  });
});

describe('getWearableProvider — unconfigured stubs', () => {
  it('every default provider throws a clear "not configured" error rather than fabricating metrics', async () => {
    for (const name of WEARABLE_PROVIDER_NAMES) {
      const provider = getWearableProvider(name);
      await expect(
        provider.fetchDailyMetrics({
          connectionId: 'c1',
          memberId: 'm1',
          sinceLocalDate: '2026-01-01',
        })
      ).rejects.toThrow(/not configured/i);
    }
  });
});

describe('registerWearableProvider — the provider-swap seam', () => {
  afterEach(() => {
    // Restore an unconfigured-equivalent stub for 'google_fit' so this test
    // can't leak a fake provider into another test in this file.
    registerWearableProvider('google_fit', {
      name: 'google_fit',
      async fetchDailyMetrics() {
        throw new Error('google_fit is not configured.');
      },
    });
  });

  it('business logic gets the swapped-in implementation with zero code changes elsewhere', async () => {
    const fakeResults: WearableDailyMetricResult[] = [
      {
        localDate: '2026-01-01',
        metricDomain: 'heart',
        metricCode: 'hrv_ms',
        numericValue: 55,
        unit: 'ms',
        recordedAt: '2026-01-01T08:00:00.000Z',
      },
    ];
    const fakeProvider: WearableProvider = {
      name: 'google_fit',
      async fetchDailyMetrics(_request: FetchWearableDailyMetricsRequest) {
        return fakeResults;
      },
    };

    registerWearableProvider('google_fit', fakeProvider);
    const result = await getWearableProvider('google_fit').fetchDailyMetrics({
      connectionId: 'c1',
      memberId: 'm1',
      sinceLocalDate: '2026-01-01',
    });
    expect(result).toEqual(fakeResults);
  });
});

describe('isWearableProviderConfigured', () => {
  const originalOura = process.env.OURA_CLIENT_ID;

  afterEach(() => {
    if (originalOura === undefined) delete process.env.OURA_CLIENT_ID;
    else process.env.OURA_CLIENT_ID = originalOura;
  });

  it('returns false when the provider-specific env var is unset — the expected state for this milestone', () => {
    delete process.env.OURA_CLIENT_ID;
    expect(isWearableProviderConfigured('oura')).toBe(false);
  });

  it('returns true once the provider-specific env var is set', () => {
    process.env.OURA_CLIENT_ID = 'test-client-id';
    expect(isWearableProviderConfigured('oura')).toBe(true);
  });
});
