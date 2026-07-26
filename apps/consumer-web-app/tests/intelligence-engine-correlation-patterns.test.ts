/**
 * Unit tests for lib/intelligence-engine/correlationPatterns.ts — pure
 * function, no Supabase client. Replaces
 * tests/intelligence-engine-cross-assessment-correlations.test.ts, which
 * tested the retired rule-based crossAssessmentCorrelations.ts.
 */
import { describe, it, expect } from 'vitest';
import { buildCorrelationPatternInsights } from '../lib/intelligence-engine/correlationPatterns';
import type { LongitudinalSignal } from '../lib/longitudinal-intelligence/types';

function signal(overrides: Partial<LongitudinalSignal> = {}): LongitudinalSignal {
  return {
    signalKey: 'correlation::pain_stress',
    signalKind: 'correlation_finding',
    signalLabel: 'Pain and perceived stress load',
    state: 'repeated_signal',
    tier: 2,
    occurrenceCount: 2,
    confidence: 0.42,
    firstObservedAt: '2026-06-01T00:00:00.000Z',
    lastObservedAt: '2026-07-01T00:00:00.000Z',
    evidenceSummary: { pairKey: 'pain_stress', direction: 'positive', rho: 0.42 },
    ...overrides,
  };
}

describe('buildCorrelationPatternInsights', () => {
  it('surfaces a tier 2 correlation signal as a pattern', () => {
    const result = buildCorrelationPatternInsights([signal()]);
    expect(result).toHaveLength(1);
    expect(result[0]!.key).toBe('correlation_correlation::pain_stress');
    expect(result[0]!.kind).toBe('cross_assessment_correlation');
    expect(result[0]!.confidence).toBe(0.42);
  });

  it('surfaces a tier 3 (established) correlation signal', () => {
    const result = buildCorrelationPatternInsights([
      signal({ tier: 3, state: 'established_pattern', occurrenceCount: 4 }),
    ]);
    expect(result).toHaveLength(1);
  });

  it('does not surface a tier 1 (one-time observation) signal — too weak to present as a pattern', () => {
    const result = buildCorrelationPatternInsights([
      signal({ tier: 1, state: 'one_time_observation', occurrenceCount: 1 }),
    ]);
    expect(result).toHaveLength(0);
  });

  it('does not surface an insufficient_data signal (tier null in practice, but explicitly excluded either way)', () => {
    const result = buildCorrelationPatternInsights([
      signal({ tier: null, state: 'insufficient_data', occurrenceCount: 0, confidence: 0 }),
    ]);
    expect(result).toHaveLength(0);
  });

  it('returns nothing for an empty signal list', () => {
    expect(buildCorrelationPatternInsights([])).toEqual([]);
  });

  it('handles multiple qualifying signals independently', () => {
    const result = buildCorrelationPatternInsights([
      signal({ signalKey: 'correlation::pain_stress', tier: 2 }),
      signal({ signalKey: 'correlation::digestion_stress', signalLabel: 'Digestion and perceived stress load', tier: 3 }),
      signal({ signalKey: 'correlation::sleep_quality_stress', tier: 1 }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.key)).toEqual([
      'correlation_correlation::pain_stress',
      'correlation_correlation::digestion_stress',
    ]);
  });
});
