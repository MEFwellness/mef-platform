import { describe, it, expect } from 'vitest';
import { buildOverlaySeries } from '../lib/case-view/overlay';
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

function checkin(localDate: string, pain: number, stress: number): DailyCheckin {
  return {
    id: localDate,
    user_id: 'member-1',
    local_date: localDate,
    pain_discomfort_level: pain,
    stress_level: stress,
  } as unknown as DailyCheckin;
}

describe('buildOverlaySeries', () => {
  it('plots real stored values for both variables, unshifted, when the finding is same-day', () => {
    const checkinsByDate = new Map([
      ['2026-07-01', checkin('2026-07-01', 3, 4)],
      ['2026-07-02', checkin('2026-07-02', 1, 2)],
    ]);
    const overlay = buildOverlaySeries({ lag: 'same_day' }, PAIR, 'Pain', 'Stress', checkinsByDate, new Map());

    expect(overlay.outcomePoints).toEqual([
      { date: '2026-07-01', value: 3 },
      { date: '2026-07-02', value: 1 },
    ]);
    expect(overlay.driverPoints).toEqual([
      { date: '2026-07-01', value: 4 },
      { date: '2026-07-02', value: 2 },
    ]);
    expect(overlay.lagOffsetDays).toBe(0);
    expect(overlay.lagNote).toBeNull();
  });

  it('shifts the driver series forward by one day when the finding is next_day, and labels it plainly', () => {
    const checkinsByDate = new Map([
      ['2026-07-01', checkin('2026-07-01', 3, 4)],
      ['2026-07-02', checkin('2026-07-02', 1, 2)],
    ]);
    const overlay = buildOverlaySeries({ lag: 'next_day' }, PAIR, 'Pain', 'Stress', checkinsByDate, new Map());

    // Driver's real 2026-07-01 reading now plots at 2026-07-02, aligning
    // with the outcome day it was actually tested against.
    expect(overlay.driverPoints).toEqual([
      { date: '2026-07-02', value: 4 },
      { date: '2026-07-03', value: 2 },
    ]);
    expect(overlay.outcomePoints[0]).toEqual({ date: '2026-07-01', value: 3 });
    expect(overlay.lagOffsetDays).toBe(1);
    expect(overlay.lagNote).toMatch(/one day earlier/i);
    expect(overlay.lagNote).not.toMatch(/causes|because/i);
  });

  it('never fabricates a missing day — a day with no real checkin is simply absent from the series', () => {
    const checkinsByDate = new Map([
      ['2026-07-01', checkin('2026-07-01', 3, 4)],
      // 2026-07-02 deliberately missing
      ['2026-07-03', checkin('2026-07-03', 2, 1)],
    ]);
    const overlay = buildOverlaySeries({ lag: 'same_day' }, PAIR, 'Pain', 'Stress', checkinsByDate, new Map());
    expect(overlay.outcomePoints.map((p) => p.date)).toEqual(['2026-07-01', '2026-07-03']);
  });
});
