/**
 * Root Presence System (Prompt 4), requirement 6: Discovery Moments —
 * pure selection-logic tests (lib/discovery-moments/select.ts), no
 * database involved. The Honest Discovery Rule guard this prompt's own
 * testing instructions call for: a member with no earned findings gets no
 * discovery moment, proven non-vacuous.
 */
import { describe, expect, it } from 'vitest';
import { discoverySignalKey, selectDiscoveryCandidate } from '../lib/discovery-moments/select';
import type { FindingView } from '../lib/case-view/types';

function finding(overrides: Partial<FindingView> = {}): FindingView {
  return {
    pairKey: 'sleep_stress',
    label: 'Sleep and stress',
    tier: 2,
    tierLabel: 'Repeated signal',
    memberSentence: 'Your sleep and stress move together.',
    coachSentence: 'Sleep and stress correlate.',
    direction: 'positive',
    lag: 'same_day',
    rho: 0.4,
    confidence: 0.7,
    observationCount: 25,
    spanDays: 25,
    splitWindowAgreement: true,
    computedAt: '2026-01-01T00:00:00.000Z',
    showOverlay: true,
    overlay: null,
    ...overrides,
  };
}

describe('selectDiscoveryCandidate — a member with no earned findings gets no discovery moment', () => {
  it('returns null for an empty findings list', () => {
    expect(selectDiscoveryCandidate([], new Set())).toBeNull();
  });

  it('returns null when the only finding is tier 1 (a one-time observation, too weak to announce as a pattern)', () => {
    const result = selectDiscoveryCandidate([finding({ tier: 1 })], new Set());
    expect(result).toBeNull();
  });

  it('is non-vacuous: a real tier-2 finding not yet surfaced produces exactly that candidate', () => {
    const f = finding({ tier: 2, pairKey: 'sleep_stress' });
    const result = selectDiscoveryCandidate([f], new Set());
    expect(result).not.toBeNull();
    expect(result?.pairKey).toBe('sleep_stress');
    expect(result?.memberSentence).toBe('Your sleep and stress move together.');
  });

  it('never re-announces a finding already in the surfaced set (once shown, always quiet after)', () => {
    const f = finding({ tier: 2, pairKey: 'sleep_stress' });
    const result = selectDiscoveryCandidate([f], new Set([discoverySignalKey(f)]));
    expect(result).toBeNull();
  });

  it('picks the newest (by computedAt) among multiple genuinely new candidates', () => {
    const older = finding({ pairKey: 'pain_stress', tier: 2, computedAt: '2026-01-01T00:00:00.000Z' });
    const newer = finding({ pairKey: 'digestion_bowel', tier: 3, computedAt: '2026-02-01T00:00:00.000Z' });
    const result = selectDiscoveryCandidate([older, newer], new Set());
    expect(result?.pairKey).toBe('digestion_bowel');
  });

  it('discoverySignalKey matches member_pattern_states own signal_key convention', () => {
    expect(discoverySignalKey(finding({ pairKey: 'sleep_stress' }))).toBe('correlation::sleep_stress');
  });
});
