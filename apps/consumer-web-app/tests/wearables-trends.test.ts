import { describe, it, expect } from 'vitest';
import {
  classifyTrend,
  detectHrvTrend,
  detectSleepTrend,
  detectActivityTrend,
  detectRecoveryLevel,
} from '../lib/wearables/trends';
import type { WearableDailyMetric } from '@mef/shared-types-contracts';

let idCounter = 0;

function metric(localDate: string, numericValue: number): WearableDailyMetric {
  idCounter += 1;
  return {
    id: `metric-${idCounter}`,
    member_id: 'member-1',
    connection_id: 'connection-1',
    provider: 'oura',
    local_date: localDate,
    metric_domain: 'heart',
    metric_code: 'hrv_ms',
    numeric_value: numericValue,
    unit: 'ms',
    recorded_at: `${localDate}T08:00:00.000Z`,
    raw_payload: {},
    created_at: `${localDate}T08:00:00.000Z`,
  };
}

function series(values: number[]): WearableDailyMetric[] {
  return values.map((value, i) => metric(`2026-01-0${i + 1}`, value));
}

describe('classifyTrend — a real 3-consecutive-day direction, never a guess from a partial history', () => {
  it('returns null with fewer than 3 days of history', () => {
    expect(classifyTrend(series([60, 50]))).toBeNull();
    expect(classifyTrend([])).toBeNull();
  });

  it('classifies a strict 3-day decline as declining', () => {
    expect(classifyTrend(series([70, 60, 50]))).toBe('declining');
  });

  it('classifies a strict 3-day rise as improving', () => {
    expect(classifyTrend(series([40, 50, 60]))).toBe('improving');
  });

  it('classifies a flat or non-monotonic run as stable, never declining or improving', () => {
    expect(classifyTrend(series([50, 50, 50]))).toBe('stable');
    expect(classifyTrend(series([50, 40, 60]))).toBe('stable'); // down then up — not a real trend
  });

  it('only looks at the most recent 3 days, ignoring earlier noise', () => {
    // Oldest-first: a spike far in the past, then a real 3-day decline.
    expect(classifyTrend(series([10, 90, 70, 60, 50]))).toBe('declining');
  });

  it('a tie (equal consecutive values) breaks the "strictly" requirement for both directions', () => {
    expect(classifyTrend(series([50, 50, 40]))).toBe('stable');
  });
});

describe('detectHrvTrend / detectSleepTrend / detectActivityTrend — thin named wrappers over classifyTrend', () => {
  it('all three agree with classifyTrend on the same input', () => {
    const declining = series([70, 60, 50]);
    expect(detectHrvTrend(declining)).toBe('declining');
    expect(detectSleepTrend(declining)).toBe('declining');
    expect(detectActivityTrend(declining)).toBe('declining');
  });
});

describe('detectRecoveryLevel — Oura-style readiness bands, real thresholds only', () => {
  it('returns null for a null score (no wearable data yet) rather than guessing a level', () => {
    expect(detectRecoveryLevel(null)).toBeNull();
  });

  it('classifies at and above the excellent threshold (85)', () => {
    expect(detectRecoveryLevel(85)).toBe('excellent');
    expect(detectRecoveryLevel(100)).toBe('excellent');
  });

  it('classifies the good band [70, 85)', () => {
    expect(detectRecoveryLevel(70)).toBe('good');
    expect(detectRecoveryLevel(84)).toBe('good');
  });

  it('classifies the fair band [50, 70)', () => {
    expect(detectRecoveryLevel(50)).toBe('fair');
    expect(detectRecoveryLevel(69)).toBe('fair');
  });

  it('classifies anything below 50 as poor', () => {
    expect(detectRecoveryLevel(0)).toBe('poor');
    expect(detectRecoveryLevel(49)).toBe('poor');
  });
});
