import { describe, it, expect } from 'vitest';
import { buildCaseEmptyState, buildStillGatheringRows } from '../lib/case-view/emptyState';
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
