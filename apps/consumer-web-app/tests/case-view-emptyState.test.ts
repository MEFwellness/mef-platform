import { describe, it, expect } from 'vitest';
import { buildCaseEmptyState, buildStillBuildingSentence, buildStillGatheringRows } from '../lib/case-view/emptyState';
import { MIN_PAIRED_OBSERVATIONS, MIN_SPAN_DAYS } from '../lib/correlation-engine/evidence';
import type { CandidatePair } from '../lib/correlation-engine/types';
import type { DailyCheckin } from '@mef/shared-types-contracts';

const PAIR: CandidatePair = {
  pairKey: 'pain_stress',
  driverId: 'STR-1',
  outcomeVariable: 'checkin.pain',
  driverVariable: 'checkin.stress',
  label: 'Pain and perceived stress load',
  weight: 'high',
  goalKeys: ['reduce_pain'],
};

function addDays(start: string, days: number): string {
  const d = new Date(`${start}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function checkin(localDate: string): DailyCheckin {
  return {
    id: localDate,
    user_id: 'member-1',
    local_date: localDate,
    pain_discomfort_level: 3,
    stress_level: 2,
  } as unknown as DailyCheckin;
}

describe('buildStillGatheringRows', () => {
  it('reports real observation/span counts against the same thresholds the correlation engine itself uses — never fabricated', () => {
    const checkinsByDate = new Map<string, DailyCheckin>();
    for (let i = 0; i < 10; i++) checkinsByDate.set(addDays('2026-07-01', i), checkin(addDays('2026-07-01', i)));

    const rows = buildStillGatheringRows([PAIR], checkinsByDate, new Map());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.observationCount).toBe(10);
    expect(rows[0]!.neededObservations).toBe(MIN_PAIRED_OBSERVATIONS);
    expect(rows[0]!.neededSpanDays).toBe(MIN_SPAN_DAYS);
  });

  it('reports zero progress for a pair with no real data at all, never a placeholder number', () => {
    const rows = buildStillGatheringRows([PAIR], new Map(), new Map());
    expect(rows[0]!.observationCount).toBe(0);
    expect(rows[0]!.spanDays).toBe(0);
  });
});

describe('buildCaseEmptyState', () => {
  it('counts real check-ins and the real elapsed span since the first one', () => {
    const checkinsByDate = new Map<string, DailyCheckin>([
      ['2026-07-01', checkin('2026-07-01')],
      ['2026-07-10', checkin('2026-07-10')],
    ]);
    const state = buildCaseEmptyState([], checkinsByDate, '2026-07-15');
    expect(state.checkinCount).toBe(2);
    expect(state.daysSinceFirstCheckin).toBe(14);
  });

  it('reports null (not zero, not fabricated) days-since-first-checkin when there are no check-ins at all', () => {
    const state = buildCaseEmptyState([], new Map(), '2026-07-15');
    expect(state.checkinCount).toBe(0);
    expect(state.daysSinceFirstCheckin).toBeNull();
  });
});

describe('buildStillBuildingSentence', () => {
  it('leads with elapsed time so a low count over a long span reads as an honest statement, not a mismatch', () => {
    const sentence = buildStillBuildingSentence(1, 9);
    expect(sentence).toBe(
      "It's been 9 days since you started, and you've logged 1 check-in so far. Most people don't see a real finding for their first few weeks, that's expected, not a problem."
    );
  });

  it('never invents or rounds either number — uses them exactly as given', () => {
    expect(buildStillBuildingSentence(3, 21)).toContain('21 days');
    expect(buildStillBuildingSentence(3, 21)).toContain('3 check-ins');
  });

  it('handles the zero-check-in case with no day count at all', () => {
    expect(buildStillBuildingSentence(0, null)).toBe(
      "You haven't logged a check-in yet, this fills in once you have."
    );
  });

  it('handles day zero (checked in today) without saying "0 days"', () => {
    const sentence = buildStillBuildingSentence(1, 0);
    expect(sentence).not.toContain('0 day');
    expect(sentence).toContain('You started today');
  });

  it('uses singular "day"/"check-in" only when the count is exactly 1', () => {
    expect(buildStillBuildingSentence(1, 1)).toContain('1 day since');
    expect(buildStillBuildingSentence(1, 1)).toContain('1 check-in so far');
    expect(buildStillBuildingSentence(2, 2)).toContain('2 days since');
    expect(buildStillBuildingSentence(2, 2)).toContain('2 check-ins so far');
  });
});
