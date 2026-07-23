/**
 * Unit tests for Longitudinal Intelligence's three-tier coaching language
 * (Prompt 12, Part 2) — describeSignalForMember/describeSignalForCoach.
 * Verifies tier-appropriate hedging and, per the Method's own
 * correlation-safe-voice discipline, that no generated sentence ever
 * claims causation or uses banned diagnostic/CHEK/AI terminology.
 */
import { describe, it, expect } from 'vitest';
import { describeSignalForCoach, describeSignalForMember } from '../lib/longitudinal-intelligence/copy';
import type { LongitudinalSignal } from '../lib/longitudinal-intelligence/types';

function signal(overrides: Partial<LongitudinalSignal> = {}): LongitudinalSignal {
  return {
    signalKey: 'registry::stress::elevated_stress',
    signalKind: 'registry_finding',
    signalLabel: 'Elevated stress',
    state: 'one_time_observation',
    tier: 1,
    occurrenceCount: 1,
    confidence: 0.6,
    firstObservedAt: '2026-07-20T00:00:00Z',
    lastObservedAt: '2026-07-20T00:00:00Z',
    evidenceSummary: {},
    ...overrides,
  };
}

const CAUSAL_TERMS = ['causes', 'caused by', 'because of', 'diagnos', 'treat ', 'cure'];
const BANNED_TERMS = ['chek', 'hlc', ' ai ', 'artificial intelligence', 'algorithm', 'confidence score'];

describe('describeSignalForMember — tier language', () => {
  it('uses cautious, tier-1 language for a one-time observation', () => {
    const text = describeSignalForMember(signal({ state: 'one_time_observation', tier: 1 })).toLowerCase();
    expect(
      text.includes('once') || text.includes('may be worth watching')
    ).toBe(true);
  });

  it('uses tier-2 language for a repeated signal', () => {
    const text = describeSignalForMember(signal({ state: 'repeated_signal', tier: 2 })).toLowerCase();
    expect(
      text.includes('more than once') || text.includes('beginning to notice') || text.includes('worth exploring')
    ).toBe(true);
  });

  it('uses tier-3 language only for an established pattern', () => {
    const text = describeSignalForMember(signal({ state: 'established_pattern', tier: 3 })).toLowerCase();
    expect(
      text.includes('consistent pattern') || text.includes('repeatedly appeared') || text.includes('recent history')
    ).toBe(true);
  });

  it('gives stale/conflicting/insufficient_data fixed, hedged phrasing regardless of tier', () => {
    expect(describeSignalForMember(signal({ state: 'stale', tier: null }))).toMatch(/older information|hasn't been updated/i);
    expect(describeSignalForMember(signal({ state: 'conflicting', tier: null }))).toMatch(/mixed|different directions/i);
    expect(describeSignalForMember(signal({ state: 'insufficient_data', tier: null }))).toMatch(/don't have enough/i);
  });

  it('is deterministic for the same signal key', () => {
    const s = signal({ state: 'repeated_signal', tier: 2, signalKey: 'checkin_metric::sleep' });
    expect(describeSignalForMember(s)).toBe(describeSignalForMember(s));
  });

  it('never claims causation and never uses banned diagnostic/CHEK/AI terminology', () => {
    const states: LongitudinalSignal['state'][] = [
      'one_time_observation',
      'repeated_signal',
      'emerging_pattern',
      'established_pattern',
      'improving',
      'worsening',
      'stable',
      'resolved',
      'stale',
      'conflicting',
      'insufficient_data',
    ];
    for (const state of states) {
      const text = describeSignalForMember(signal({ state, tier: state === 'established_pattern' ? 3 : 1 })).toLowerCase();
      for (const term of CAUSAL_TERMS) expect(text).not.toContain(term);
      for (const term of BANNED_TERMS) expect(text).not.toContain(term);
    }
  });
});

describe('describeSignalForCoach', () => {
  it('includes occurrence count and last-observed date alongside the member-safe sentence', () => {
    const text = describeSignalForCoach(
      signal({ occurrenceCount: 3, lastObservedAt: '2026-07-15T00:00:00Z' })
    );
    expect(text).toContain('3 occurrences');
    expect(text).toContain('2026-07-15');
  });

  it('also never claims causation', () => {
    const text = describeSignalForCoach(signal({ state: 'worsening', tier: 3 })).toLowerCase();
    for (const term of CAUSAL_TERMS) expect(text).not.toContain(term);
  });
});
