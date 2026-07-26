import { describe, it, expect } from 'vitest';
import { classifyCorrelationFindingSignal, type PriorCorrelationState } from '../lib/correlation-engine/classify';
import { MIN_SPAN_DAYS } from '../lib/correlation-engine/evidence';
import type { CandidatePair, CorrelationEvidence } from '../lib/correlation-engine/types';

const PAIR: CandidatePair = {
  pairKey: 'pain_stress',
  driverId: 'STR-1',
  outcomeVariable: 'checkin.pain',
  driverVariable: 'checkin.stress',
  label: 'Pain and perceived stress load',
  weight: 'high',
  goalKeys: ['reduce_pain'],
};

const NOW = '2026-07-26T00:00:00.000Z';

function evidence(overrides: Partial<CorrelationEvidence> = {}): CorrelationEvidence {
  return {
    lag: 'same_day',
    direction: 'positive',
    rho: 0.65,
    observationCount: 25,
    spanDays: 25,
    splitWindowAgreement: true,
    ...overrides,
  };
}

describe('classifyCorrelationFindingSignal — no evidence', () => {
  it('produces insufficient_data with tier 1, zero occurrence, zero confidence', () => {
    const { signal, findingRow } = classifyCorrelationFindingSignal(PAIR, null, null, NOW);
    expect(signal.state).toBe('insufficient_data');
    expect(signal.tier).toBe(1);
    expect(signal.occurrenceCount).toBe(0);
    expect(signal.confidence).toBe(0);
    expect(signal.signalKind).toBe('correlation_finding');
    expect(signal.signalKey).toBe('correlation::pain_stress');
    expect(findingRow.state).toBe('insufficient_data');
    expect(findingRow.lag).toBeNull();
  });

  it('carries forward firstObservedAt from a prior row even while producing insufficient_data now', () => {
    const prior: PriorCorrelationState = {
      state: 'one_time_observation',
      occurrenceCount: 1,
      firstObservedAt: '2026-06-01T00:00:00.000Z',
      direction: 'positive',
    };
    const { signal } = classifyCorrelationFindingSignal(PAIR, null, prior, NOW);
    expect(signal.firstObservedAt).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('classifyCorrelationFindingSignal — occurrence progression', () => {
  it('is a one_time_observation (tier 1) on the first real evidence with no prior row', () => {
    const { signal } = classifyCorrelationFindingSignal(PAIR, evidence(), null, NOW);
    expect(signal.state).toBe('one_time_observation');
    expect(signal.tier).toBe(1);
    expect(signal.occurrenceCount).toBe(1);
    expect(signal.firstObservedAt).toBe(NOW);
  });

  it('resets to occurrence 1 when the prior run found no relationship at all', () => {
    const prior: PriorCorrelationState = {
      state: 'insufficient_data',
      occurrenceCount: 0,
      firstObservedAt: '2026-06-01T00:00:00.000Z',
      direction: null,
    };
    const { signal } = classifyCorrelationFindingSignal(PAIR, evidence(), prior, NOW);
    expect(signal.occurrenceCount).toBe(1);
    expect(signal.firstObservedAt).toBe(NOW);
  });

  it('resets to occurrence 1 when the direction flips from the prior run', () => {
    const prior: PriorCorrelationState = {
      state: 'repeated_signal',
      occurrenceCount: 2,
      firstObservedAt: '2026-06-01T00:00:00.000Z',
      direction: 'negative',
    };
    const { signal } = classifyCorrelationFindingSignal(PAIR, evidence({ direction: 'positive' }), prior, NOW);
    expect(signal.occurrenceCount).toBe(1);
  });

  it('grows occurrence and reaches repeated_signal (tier 2) on a second consecutive same-direction confirmation', () => {
    const prior: PriorCorrelationState = {
      state: 'one_time_observation',
      occurrenceCount: 1,
      firstObservedAt: '2026-06-01T00:00:00.000Z',
      direction: 'positive',
    };
    const { signal } = classifyCorrelationFindingSignal(PAIR, evidence(), prior, NOW);
    expect(signal.occurrenceCount).toBe(2);
    expect(signal.state).toBe('repeated_signal');
    expect(signal.tier).toBe(2);
    expect(signal.firstObservedAt).toBe('2026-06-01T00:00:00.000Z'); // preserved across confirmations
  });

  it('reaches emerging_pattern (tier 2) at occurrence 3+ when the fuller established bar is not yet cleared', () => {
    const prior: PriorCorrelationState = {
      state: 'repeated_signal',
      occurrenceCount: 2,
      firstObservedAt: '2026-06-01T00:00:00.000Z',
      direction: 'positive',
    };
    // Confidence below MIN_CONFIDENCE_TO_PERSIST (0.55) keeps it out of 'established_pattern'.
    const { signal } = classifyCorrelationFindingSignal(PAIR, evidence({ rho: 0.4 }), prior, NOW);
    expect(signal.occurrenceCount).toBe(3);
    expect(signal.state).toBe('emerging_pattern');
    expect(signal.tier).toBe(2);
  });
});

describe('classifyCorrelationFindingSignal — established_pattern (tier 3) requires every condition together', () => {
  const strongPrior: PriorCorrelationState = {
    state: 'emerging_pattern',
    occurrenceCount: 2,
    firstObservedAt: '2026-06-01T00:00:00.000Z',
    direction: 'positive',
  };

  it('reaches established_pattern when occurrence>=3, span>=MIN_SPAN_DAYS, confidence>=0.55, and split-window agrees', () => {
    const { signal } = classifyCorrelationFindingSignal(
      PAIR,
      evidence({ rho: 0.7, spanDays: MIN_SPAN_DAYS, splitWindowAgreement: true }),
      strongPrior,
      NOW
    );
    expect(signal.occurrenceCount).toBe(3);
    expect(signal.state).toBe('established_pattern');
    expect(signal.tier).toBe(3);
  });

  it('does NOT reach established_pattern when split-window agreement is false, even with strong confidence and enough occurrences', () => {
    const { signal } = classifyCorrelationFindingSignal(
      PAIR,
      evidence({ rho: 0.9, spanDays: 40, splitWindowAgreement: false }),
      strongPrior,
      NOW
    );
    expect(signal.state).not.toBe('established_pattern');
    expect(signal.tier).toBe(2);
  });

  it('does NOT reach established_pattern when confidence is below MIN_CONFIDENCE_TO_PERSIST, even with agreement and span', () => {
    const { signal } = classifyCorrelationFindingSignal(
      PAIR,
      evidence({ rho: 0.4, spanDays: 40, splitWindowAgreement: true }),
      strongPrior,
      NOW
    );
    expect(signal.state).not.toBe('established_pattern');
  });

  it('does NOT reach established_pattern when the span is under MIN_SPAN_DAYS', () => {
    const { signal } = classifyCorrelationFindingSignal(
      PAIR,
      evidence({ rho: 0.9, spanDays: MIN_SPAN_DAYS - 1, splitWindowAgreement: true }),
      strongPrior,
      NOW
    );
    expect(signal.state).not.toBe('established_pattern');
  });
});

describe('classifyCorrelationFindingSignal — confidence and evidence summary', () => {
  it('stores confidence as the effect size (|rho|), not a separate significance number', () => {
    const { signal } = classifyCorrelationFindingSignal(PAIR, evidence({ rho: -0.62 }), null, NOW);
    expect(signal.confidence).toBeCloseTo(0.62, 10);
  });

  it('records the pair key, driver id, and full evidence shape in evidenceSummary for coach traceability', () => {
    const { signal } = classifyCorrelationFindingSignal(PAIR, evidence({ direction: 'negative', rho: -0.5 }), null, NOW);
    expect(signal.evidenceSummary).toMatchObject({
      pairKey: 'pain_stress',
      driverId: 'STR-1',
      direction: 'negative',
    });
  });

  it('never claims a direction word that implies causation in the label (label is passed through verbatim from the pair)', () => {
    const { signal } = classifyCorrelationFindingSignal(PAIR, evidence(), null, NOW);
    expect(signal.signalLabel).toBe('Pain and perceived stress load');
  });
});
