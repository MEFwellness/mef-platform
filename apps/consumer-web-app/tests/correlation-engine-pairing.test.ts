import { describe, it, expect } from 'vitest';
import { addDays, pairNextDay, pairSameDay, spanDays, splitInHalf } from '../lib/correlation-engine/pairing';

describe('addDays', () => {
  it('adds a simple day within a month', () => {
    expect(addDays('2026-06-15', 1)).toBe('2026-06-16');
  });

  it('rolls over a month boundary', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01');
  });

  it('rolls over a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('handles a leap-day month correctly', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // 2028 is a leap year
  });
});

describe('pairSameDay', () => {
  it('pairs only dates present in both series', () => {
    const outcome = new Map([
      ['2026-06-01', 1],
      ['2026-06-02', 2],
      ['2026-06-04', 4],
    ]);
    const driver = new Map([
      ['2026-06-01', 10],
      ['2026-06-02', 20],
      ['2026-06-03', 30], // no matching outcome day — excluded
    ]);
    const result = pairSameDay(outcome, driver);
    expect(result.dates).toEqual(['2026-06-01', '2026-06-02']);
    expect(result.outcome).toEqual([1, 2]);
    expect(result.driver).toEqual([10, 20]);
  });

  it('returns empty arrays when there is no overlap', () => {
    const outcome = new Map([['2026-06-01', 1]]);
    const driver = new Map([['2026-06-02', 10]]);
    const result = pairSameDay(outcome, driver);
    expect(result.dates).toEqual([]);
  });

  it('sorts pairs chronologically regardless of map insertion order', () => {
    const outcome = new Map([
      ['2026-06-03', 3],
      ['2026-06-01', 1],
    ]);
    const driver = new Map([
      ['2026-06-01', 10],
      ['2026-06-03', 30],
    ]);
    const result = pairSameDay(outcome, driver);
    expect(result.dates).toEqual(['2026-06-01', '2026-06-03']);
  });
});

describe('pairNextDay', () => {
  it('pairs driver[d] with outcome[d+1] only when both real values exist', () => {
    const outcome = new Map([
      ['2026-06-02', 2], // day after driver's 06-01
      ['2026-06-03', 3], // day after driver's 06-02
    ]);
    const driver = new Map([
      ['2026-06-01', 10],
      ['2026-06-02', 20],
      ['2026-06-05', 50], // 06-06 has no outcome — excluded
    ]);
    const result = pairNextDay(outcome, driver);
    expect(result.dates).toEqual(['2026-06-01', '2026-06-02']);
    expect(result.driver).toEqual([10, 20]);
    expect(result.outcome).toEqual([2, 3]);
  });

  it('never interpolates across a gap — a missing next day breaks that one pair only', () => {
    const outcome = new Map([
      ['2026-06-01', 1],
      // 06-02 missing entirely (member skipped a check-in)
      ['2026-06-03', 3],
    ]);
    const driver = new Map([
      ['2026-06-01', 10],
      ['2026-06-02', 20],
    ]);
    const result = pairNextDay(outcome, driver);
    // driver 06-01 -> outcome 06-02 (missing, excluded); driver 06-02 -> outcome 06-03 (present)
    expect(result.dates).toEqual(['2026-06-02']);
    expect(result.driver).toEqual([20]);
    expect(result.outcome).toEqual([3]);
  });
});

describe('spanDays', () => {
  it('is 0 for fewer than 2 dates', () => {
    expect(spanDays([])).toBe(0);
    expect(spanDays(['2026-06-01'])).toBe(0);
  });

  it('computes elapsed days between the first and last date', () => {
    expect(spanDays(['2026-06-01', '2026-06-10', '2026-06-22'])).toBe(21);
  });
});

describe('splitInHalf', () => {
  it('splits by date order into two roughly equal halves', () => {
    const paired = {
      outcome: [1, 2, 3, 4],
      driver: [10, 20, 30, 40],
      dates: ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04'],
    };
    const [first, second] = splitInHalf(paired);
    expect(first.dates).toEqual(['2026-06-01', '2026-06-02']);
    expect(second.dates).toEqual(['2026-06-03', '2026-06-04']);
    expect(first.outcome).toEqual([1, 2]);
    expect(second.outcome).toEqual([3, 4]);
  });

  it('puts the odd element in the second half for an odd-length series', () => {
    const paired = {
      outcome: [1, 2, 3],
      driver: [10, 20, 30],
      dates: ['2026-06-01', '2026-06-02', '2026-06-03'],
    };
    const [first, second] = splitInHalf(paired);
    expect(first.dates).toEqual(['2026-06-01']);
    expect(second.dates).toEqual(['2026-06-02', '2026-06-03']);
  });
});
