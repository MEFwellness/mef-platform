/**
 * Unit tests for Lifestyle Experiments' read-time overdue derivation
 * (Prompt 11) — pure functions only, no Supabase client. Confirms the
 * boundary at exactly start_date + duration_days, and that the stored
 * status is never mutated (derivation is a pure read-time projection).
 */
import { describe, it, expect } from 'vitest';
import { isExperimentOverdue, deriveEffectiveStatus } from '../lib/lifestyle-experiments/lifecycle';
import type { LifestyleExperiment } from '../lib/lifestyle-experiments/types';

function experiment(overrides: Partial<LifestyleExperiment> = {}): LifestyleExperiment {
  return {
    id: 'e1',
    memberId: 'm1',
    recommendationId: 'r1',
    title: 'Wind-down routine',
    protocol: 'Try a consistent bedtime routine.',
    startDate: '2026-06-01',
    durationDays: 7,
    status: 'active',
    reflectionText: null,
    outcome: null,
    closedAt: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('isExperimentOverdue / deriveEffectiveStatus', () => {
  it('is not overdue while still within the tracking window', () => {
    const e = experiment({ startDate: '2026-06-01', durationDays: 7 });
    expect(isExperimentOverdue(e, new Date('2026-06-05T00:00:00.000Z'))).toBe(false);
    expect(deriveEffectiveStatus(e, new Date('2026-06-05T00:00:00.000Z'))).toBe('active');
  });

  it('is not yet overdue exactly at the boundary (start + duration)', () => {
    const e = experiment({ startDate: '2026-06-01', durationDays: 7 });
    expect(isExperimentOverdue(e, new Date('2026-06-08T00:00:00.000Z'))).toBe(false);
  });

  it('is overdue the moment it passes start + duration', () => {
    const e = experiment({ startDate: '2026-06-01', durationDays: 7 });
    expect(isExperimentOverdue(e, new Date('2026-06-08T00:00:00.001Z'))).toBe(true);
    expect(deriveEffectiveStatus(e, new Date('2026-06-08T00:00:00.001Z'))).toBe('expired_no_reflection');
  });

  it('never applies to a non-active experiment, regardless of date', () => {
    const completed = experiment({ status: 'completed', startDate: '2020-01-01', durationDays: 7 });
    expect(isExperimentOverdue(completed, new Date())).toBe(false);
    expect(deriveEffectiveStatus(completed, new Date())).toBe('completed');

    const abandoned = experiment({ status: 'abandoned', startDate: '2020-01-01', durationDays: 7 });
    expect(deriveEffectiveStatus(abandoned, new Date())).toBe('abandoned');
  });

  it('never mutates the input object', () => {
    const e = experiment({ startDate: '2026-06-01', durationDays: 7 });
    const before = { ...e };
    deriveEffectiveStatus(e, new Date('2026-07-01T00:00:00.000Z'));
    expect(e).toEqual(before);
  });
});
