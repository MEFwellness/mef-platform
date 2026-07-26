import { describe, it, expect } from 'vitest';
import { buildFindings } from '../lib/case-view/findings';
import type { LongitudinalSignalRow } from '../lib/longitudinal-intelligence/types';
import type { CandidatePair } from '../lib/correlation-engine/types';

function signalRow(overrides: Partial<LongitudinalSignalRow> = {}): LongitudinalSignalRow {
  return {
    id: 'row-1',
    memberId: 'member-1',
    signalKey: 'correlation::pain_stress',
    signalKind: 'correlation_finding',
    signalLabel: 'Pain and perceived stress load',
    state: 'established_pattern',
    tier: 3,
    occurrenceCount: 4,
    confidence: 0.65,
    firstObservedAt: '2026-06-01T00:00:00.000Z',
    lastObservedAt: '2026-07-20T00:00:00.000Z',
    evidenceSummary: {
      pairKey: 'pain_stress',
      driverId: 'STR-1',
      lag: 'same_day',
      direction: 'positive',
      rho: 0.55,
      observationCount: 30,
      spanDays: 40,
      splitWindowAgreement: true,
    },
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    ...overrides,
  };
}

const PAIR: CandidatePair = {
  pairKey: 'pain_stress',
  driverId: 'STR-1',
  outcomeVariable: 'checkin.pain',
  driverVariable: 'checkin.stress',
  label: 'Pain and perceived stress load',
  weight: 'high',
  goalKeys: ['reduce_pain'],
};

describe('buildFindings', () => {
  it('includes an established_pattern (tier 3) finding, with tier-appropriate wording and showOverlay true', () => {
    const findings = buildFindings([signalRow()], [PAIR], ['reduce_pain']);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.tier).toBe(3);
    expect(findings[0]!.tierLabel).toBe('Qualified pattern');
    expect(findings[0]!.showOverlay).toBe(true);
    expect(findings[0]!.memberSentence.length).toBeGreaterThan(0);
  });

  it('excludes insufficient_data even though its DB row nominally carries tier: 1 — it has not earned anything yet', () => {
    const findings = buildFindings(
      [signalRow({ state: 'insufficient_data', tier: 1, evidenceSummary: { pairKey: 'pain_stress', driverId: 'STR-1' } })],
      [PAIR],
      ['reduce_pain']
    );
    expect(findings).toHaveLength(0);
  });

  it('includes a one_time_observation (tier 1) finding but with showOverlay false — not yet "repeated signal or above"', () => {
    const findings = buildFindings(
      [signalRow({ state: 'one_time_observation', tier: 1, occurrenceCount: 1 })],
      [PAIR],
      ['reduce_pain']
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.showOverlay).toBe(false);
  });

  it('includes a repeated_signal (tier 2) finding with showOverlay true', () => {
    const findings = buildFindings([signalRow({ state: 'repeated_signal', tier: 2, occurrenceCount: 2 })], [PAIR], ['reduce_pain']);
    expect(findings[0]!.showOverlay).toBe(true);
    expect(findings[0]!.tierLabel).toBe('Repeated signal');
  });

  it('ignores a signal from a different signalKind entirely (e.g. checkin_metric)', () => {
    const findings = buildFindings([signalRow({ signalKind: 'checkin_metric' })], [PAIR], ['reduce_pain']);
    expect(findings).toHaveLength(0);
  });

  it('excludes a finding whose pair is not relevant to any of her current real goals', () => {
    const findings = buildFindings([signalRow()], [PAIR], ['sleep_better']);
    expect(findings).toHaveLength(0);
  });

  it('includes every earned finding when she has no real weighting goal on file (broad sampling)', () => {
    const findings = buildFindings([signalRow()], [PAIR], []);
    expect(findings).toHaveLength(1);
  });

  it('carries the raw numbers through for coach-facing detail (observation count, span, rho, split-window agreement)', () => {
    const findings = buildFindings([signalRow()], [PAIR], ['reduce_pain']);
    expect(findings[0]).toMatchObject({
      observationCount: 30,
      spanDays: 40,
      rho: 0.55,
      splitWindowAgreement: true,
      lag: 'same_day',
      direction: 'positive',
    });
  });

  it('never produces language implying causation (a plain safety check on the actual sentence)', () => {
    const findings = buildFindings([signalRow()], [PAIR], ['reduce_pain']);
    const sentence = findings[0]!.memberSentence.toLowerCase();
    expect(sentence).not.toContain('causes');
    expect(sentence).not.toContain('because of');
  });
});
