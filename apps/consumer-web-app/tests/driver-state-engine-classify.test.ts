import { describe, it, expect } from 'vitest';
import { classifyDriverState, type DriverPairVerdict } from '../lib/driver-state-engine/classify';
import type { CorrelationFindingRow } from '../lib/correlation-engine/types';

function finding(overrides: Partial<CorrelationFindingRow> = {}): CorrelationFindingRow {
  return {
    memberId: 'member-1',
    pairKey: 'pain_stress',
    lag: 'same_day',
    direction: 'positive',
    rho: 0.5,
    observationCount: 25,
    spanDays: 25,
    splitWindowAgreement: true,
    state: 'established_pattern',
    tier: 3,
    confidence: 0.6,
    computedAt: '2026-07-26T00:00:00.000Z',
    ...overrides,
  };
}

describe('classifyDriverState — no candidate pairs at all', () => {
  it('stays unknown — no daily-loggable source exists yet for this driver', () => {
    expect(classifyDriverState([])).toMatchObject({ state: 'unknown' });
  });
});

describe('classifyDriverState — implicated', () => {
  it('one pair reaching "Qualified pattern" (established_pattern) is enough to implicate the driver', () => {
    const verdicts: DriverPairVerdict[] = [
      { pairKey: 'a', finding: finding({ pairKey: 'a', state: 'established_pattern' }), hasSufficientData: true },
      { pairKey: 'b', finding: finding({ pairKey: 'b', state: 'insufficient_data' }), hasSufficientData: true },
    ];
    expect(classifyDriverState(verdicts)).toMatchObject({ state: 'implicated' });
  });
});

describe('classifyDriverState — watching', () => {
  it('a pair still building evidence (repeated_signal) keeps the driver watching, not ruled out', () => {
    const verdicts: DriverPairVerdict[] = [
      { pairKey: 'a', finding: finding({ pairKey: 'a', state: 'repeated_signal', tier: 2 }), hasSufficientData: true },
    ];
    expect(classifyDriverState(verdicts)).toMatchObject({ state: 'watching' });
  });

  it('a pair that has not yet accumulated enough paired data keeps the driver watching, even if the correlation engine reported insufficient_data', () => {
    const verdicts: DriverPairVerdict[] = [
      { pairKey: 'a', finding: finding({ pairKey: 'a', state: 'insufficient_data', tier: 1 }), hasSufficientData: false },
    ];
    expect(classifyDriverState(verdicts)).toMatchObject({ state: 'watching' });
  });
});

describe('classifyDriverState — ruled out', () => {
  it('every mapped pair has enough paired data and none clears the floor', () => {
    const verdicts: DriverPairVerdict[] = [
      { pairKey: 'a', finding: finding({ pairKey: 'a', state: 'insufficient_data', tier: 1 }), hasSufficientData: true },
      { pairKey: 'b', finding: finding({ pairKey: 'b', state: 'insufficient_data', tier: 1 }), hasSufficientData: true },
    ];
    expect(classifyDriverState(verdicts)).toMatchObject({ state: 'ruled_out' });
  });

  it('never rules out a driver from question-count/staleness alone — a driver with no finding row yet (finding: null) but sufficient underlying data is treated the same as a weak-but-tested one', () => {
    const verdicts: DriverPairVerdict[] = [{ pairKey: 'a', finding: null, hasSufficientData: true }];
    expect(classifyDriverState(verdicts)).toMatchObject({ state: 'ruled_out' });
  });
});

describe('classifyDriverState — precedence', () => {
  it('implicated beats watching and ruled_out when pairs disagree', () => {
    const verdicts: DriverPairVerdict[] = [
      { pairKey: 'a', finding: finding({ pairKey: 'a', state: 'established_pattern' }), hasSufficientData: true },
      { pairKey: 'b', finding: finding({ pairKey: 'b', state: 'insufficient_data' }), hasSufficientData: true },
      { pairKey: 'c', finding: finding({ pairKey: 'c', state: 'repeated_signal', tier: 2 }), hasSufficientData: true },
    ];
    expect(classifyDriverState(verdicts)).toMatchObject({ state: 'implicated' });
  });

  it('watching beats ruled_out when pairs disagree', () => {
    const verdicts: DriverPairVerdict[] = [
      { pairKey: 'a', finding: finding({ pairKey: 'a', state: 'insufficient_data' }), hasSufficientData: true },
      { pairKey: 'b', finding: finding({ pairKey: 'b', state: 'one_time_observation', tier: 1 }), hasSufficientData: true },
    ];
    expect(classifyDriverState(verdicts)).toMatchObject({ state: 'watching' });
  });
});
