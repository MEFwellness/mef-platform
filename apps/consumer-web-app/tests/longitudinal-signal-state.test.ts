/**
 * Unit tests for Longitudinal Intelligence signal classification (Prompt
 * 12, Part 1) — pure functions only, no Supabase client, same convention
 * as tests/root-router-outcome.test.ts. Covers the eleven-value
 * SignalState vocabulary: one-time/repeated/emerging/established,
 * improving/worsening/stable/resolved, stale, conflicting, insufficient
 * data.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyCheckinMetricSignal,
  classifyRegistryFindingSignal,
  detectConflictingSignals,
  SIGNAL_STALE_DAYS,
} from '../lib/longitudinal-intelligence/signalState';
import type { FindingTimelineEntry } from '../lib/registry/timeline';
import type { WellnessInsightDraft } from '../lib/intelligence/types';
import type { LongitudinalSignalRow } from '../lib/longitudinal-intelligence/types';

const NOW = new Date('2026-07-23T00:00:00Z');

function timelineEntry(overrides: Partial<FindingTimelineEntry> = {}): FindingTimelineEntry {
  return {
    domain: 'stress',
    code: 'elevated_stress',
    label: 'Elevated stress',
    firstObservedAt: '2026-07-01T00:00:00Z',
    lastObservedAt: '2026-07-20T00:00:00Z',
    occurrenceCount: 1,
    currentStatus: 'active',
    currentTrendStatus: null,
    resolvedAt: null,
    confidenceOverTime: [{ recordedAt: '2026-07-20T00:00:00Z', confidence: 0.7, severity: 'moderate' }],
    ...overrides,
  };
}

describe('classifyRegistryFindingSignal', () => {
  it('classifies a single occurrence as one_time_observation, tier 1', () => {
    const result = classifyRegistryFindingSignal(timelineEntry({ occurrenceCount: 1 }), NOW);
    expect(result.state).toBe('one_time_observation');
    expect(result.tier).toBe(1);
  });

  it('classifies two occurrences as repeated_signal, tier 2', () => {
    const result = classifyRegistryFindingSignal(timelineEntry({ occurrenceCount: 2 }), NOW);
    expect(result.state).toBe('repeated_signal');
    expect(result.tier).toBe(2);
  });

  it('classifies 3+ occurrences over a short span as emerging_pattern (not yet established)', () => {
    const result = classifyRegistryFindingSignal(
      timelineEntry({
        occurrenceCount: 3,
        firstObservedAt: '2026-07-18T00:00:00Z',
        lastObservedAt: '2026-07-20T00:00:00Z',
      }),
      NOW
    );
    expect(result.state).toBe('emerging_pattern');
    expect(result.tier).toBe(2);
  });

  it('classifies 3+ occurrences over 21+ days with high confidence and a worsening trend as worsening, tier 3', () => {
    const result = classifyRegistryFindingSignal(
      timelineEntry({
        occurrenceCount: 4,
        firstObservedAt: '2026-06-01T00:00:00Z',
        lastObservedAt: '2026-07-15T00:00:00Z',
        currentTrendStatus: 'worsening',
        confidenceOverTime: [{ recordedAt: '2026-07-15T00:00:00Z', confidence: 0.8, severity: 'moderate' }],
      }),
      NOW
    );
    expect(result.state).toBe('worsening');
    expect(result.tier).toBe(3);
  });

  it('the same established evidence with an improving trend classifies as improving, tier 3', () => {
    const result = classifyRegistryFindingSignal(
      timelineEntry({
        occurrenceCount: 4,
        firstObservedAt: '2026-06-01T00:00:00Z',
        lastObservedAt: '2026-07-15T00:00:00Z',
        currentTrendStatus: 'improving',
        confidenceOverTime: [{ recordedAt: '2026-07-15T00:00:00Z', confidence: 0.8, severity: 'mild' }],
      }),
      NOW
    );
    expect(result.state).toBe('improving');
    expect(result.tier).toBe(3);
  });

  it('does not reach established_pattern when confidence is below the persist threshold, even with enough occurrences and span', () => {
    const result = classifyRegistryFindingSignal(
      timelineEntry({
        occurrenceCount: 5,
        firstObservedAt: '2026-06-01T00:00:00Z',
        lastObservedAt: '2026-07-15T00:00:00Z',
        currentTrendStatus: 'worsening',
        confidenceOverTime: [{ recordedAt: '2026-07-15T00:00:00Z', confidence: 0.3, severity: 'mild' }],
      }),
      NOW
    );
    expect(result.state).not.toBe('worsening');
    expect(result.state).toBe('emerging_pattern');
  });

  it('classifies a resolved finding as resolved, tier 2', () => {
    const result = classifyRegistryFindingSignal(
      timelineEntry({ resolvedAt: '2026-07-10T00:00:00Z', currentTrendStatus: 'resolved' }),
      NOW
    );
    expect(result.state).toBe('resolved');
    expect(result.tier).toBe(2);
  });

  it('classifies a finding untouched longer than SIGNAL_STALE_DAYS as stale, regardless of its prior trend', () => {
    const staleDate = new Date(NOW);
    staleDate.setUTCDate(staleDate.getUTCDate() - (SIGNAL_STALE_DAYS + 5));
    const result = classifyRegistryFindingSignal(
      timelineEntry({
        occurrenceCount: 4,
        lastObservedAt: staleDate.toISOString(),
        currentTrendStatus: 'worsening',
      }),
      NOW
    );
    expect(result.state).toBe('stale');
    expect(result.tier).toBeNull();
  });
});

describe('classifyCheckinMetricSignal', () => {
  function draft(trendState: WellnessInsightDraft['trendState'], confidence = 0.7): WellnessInsightDraft {
    return {
      insightType: 'trend',
      wellnessArea: 'stress',
      trendState,
      trendStrength: 'moderate',
      patternKey: 'trend_stress',
      title: 'x',
      memberSummary: 'x',
      coachDetail: 'x',
      confidence,
      severity: 'notable',
      timeWindow: 'last_30_days',
      evidenceRefs: [],
      reasoningCodes: [],
      recommendedCoachingResponse: null,
      recommendedCoachAction: null,
      memberVisible: true,
    };
  }

  it('classifies a null draft as insufficient_data, tier 1', () => {
    const result = classifyCheckinMetricSignal('stress', null, null, '2026-07-23');
    expect(result.state).toBe('insufficient_data');
    expect(result.tier).toBe(1);
    expect(result.occurrenceCount).toBe(0);
  });

  it('maps declining -> worsening and inconsistent -> conflicting', () => {
    expect(classifyCheckinMetricSignal('stress', draft('declining'), null, '2026-07-23').state).toBe('worsening');
    expect(classifyCheckinMetricSignal('stress', draft('inconsistent'), null, '2026-07-23').state).toBe('conflicting');
  });

  it('a conflicting state never carries a tier', () => {
    const result = classifyCheckinMetricSignal('stress', draft('inconsistent'), null, '2026-07-23');
    expect(result.tier).toBeNull();
  });

  it('occurrence count grows across runs when the state repeats, and resets when it changes', () => {
    const first = classifyCheckinMetricSignal('stress', draft('declining'), null, '2026-07-21');
    expect(first.occurrenceCount).toBe(1);
    expect(first.tier).toBe(1);

    const second = classifyCheckinMetricSignal(
      'stress',
      draft('declining'),
      { state: first.state, occurrenceCount: first.occurrenceCount, firstObservedAt: first.firstObservedAt },
      '2026-07-22'
    );
    expect(second.occurrenceCount).toBe(2);
    expect(second.tier).toBe(2);

    const changed = classifyCheckinMetricSignal(
      'stress',
      draft('improving'),
      { state: second.state, occurrenceCount: second.occurrenceCount, firstObservedAt: second.firstObservedAt },
      '2026-07-23'
    );
    expect(changed.state).toBe('improving');
    expect(changed.occurrenceCount).toBe(1);
  });

  it('only reaches tier 3 once the same read has persisted across recompute runs and confidence is high enough', () => {
    type Prior = Pick<LongitudinalSignalRow, 'state' | 'occurrenceCount' | 'firstObservedAt'>;
    let prior: Prior | null = null;
    let result = classifyCheckinMetricSignal('stress', draft('recurring_pattern', 0.8), prior, '2026-07-01');
    for (let i = 0; i < 2; i++) {
      prior = { state: result.state, occurrenceCount: result.occurrenceCount, firstObservedAt: result.firstObservedAt };
      result = classifyCheckinMetricSignal('stress', draft('recurring_pattern', 0.8), prior, '2026-07-01');
    }
    expect(result.state).toBe('established_pattern');
    expect(result.tier).toBe(3);
  });
});

describe('detectConflictingSignals', () => {
  it('re-labels both signals conflicting when a registry finding and a check-in metric in the same domain disagree', () => {
    const worsening = classifyRegistryFindingSignal(
      timelineEntry({ domain: 'stress', currentTrendStatus: 'worsening', occurrenceCount: 4, firstObservedAt: '2026-06-01T00:00:00Z', lastObservedAt: '2026-07-15T00:00:00Z', confidenceOverTime: [{ recordedAt: '2026-07-15T00:00:00Z', confidence: 0.8, severity: 'moderate' }] }),
      NOW
    );
    const improving = classifyCheckinMetricSignal(
      'stress',
      {
        insightType: 'trend',
        wellnessArea: 'stress',
        trendState: 'improving',
        trendStrength: 'moderate',
        patternKey: 'trend_stress',
        title: 'x',
        memberSummary: 'x',
        coachDetail: 'x',
        confidence: 0.7,
        severity: 'notable',
        timeWindow: 'last_30_days',
        evidenceRefs: [],
        reasoningCodes: [],
        recommendedCoachingResponse: null,
        recommendedCoachAction: null,
        memberVisible: true,
      },
      null,
      '2026-07-23'
    );

    const result = detectConflictingSignals([worsening, improving], () => 'stress_nervous_system');
    expect(result.every((s) => s.state === 'conflicting')).toBe(true);
    expect(result.every((s) => s.tier === null)).toBe(true);
  });

  it('leaves signals untouched when there is no domain-level disagreement', () => {
    const onlyWorsening = classifyRegistryFindingSignal(
      timelineEntry({ domain: 'stress', currentTrendStatus: 'worsening' }),
      NOW
    );
    const result = detectConflictingSignals([onlyWorsening], () => 'stress_nervous_system');
    expect(result[0]!.state).not.toBe('conflicting');
  });

  it('ignores signals with no resolvable coaching domain', () => {
    const signal = classifyRegistryFindingSignal(timelineEntry(), NOW);
    const result = detectConflictingSignals([signal], () => null);
    expect(result).toEqual([signal]);
  });
});
