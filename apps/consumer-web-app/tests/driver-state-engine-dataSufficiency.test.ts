import { describe, it, expect } from 'vitest';
import { hasSufficientPairedData } from '../lib/driver-state-engine/dataSufficiency';
import { MIN_PAIRED_OBSERVATIONS } from '../lib/correlation-engine/evidence';
import type { DailySeries } from '../lib/correlation-engine/types';

function addDays(start: string, days: number): string {
  const d = new Date(`${start}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Enough paired same-day observations, spanning enough days, with real variation on both sides — clears every base-gate check except effect size. */
function buildSufficientSeries(): { outcome: DailySeries; driver: DailySeries } {
  const outcome: DailySeries = new Map();
  const driver: DailySeries = new Map();
  for (let i = 0; i < MIN_PAIRED_OBSERVATIONS + 5; i++) {
    const date = addDays('2026-01-01', i);
    outcome.set(date, (i % 5) + 1);
    driver.set(date, ((i + 2) % 5) + 1);
  }
  return { outcome, driver };
}

describe('hasSufficientPairedData', () => {
  it('is true when enough paired, sufficiently-varied observations span enough days', () => {
    const { outcome, driver } = buildSufficientSeries();
    expect(hasSufficientPairedData(outcome, driver)).toBe(true);
  });

  it('is false when there are too few paired observations', () => {
    const outcome: DailySeries = new Map();
    const driver: DailySeries = new Map();
    for (let i = 0; i < 5; i++) {
      const date = addDays('2026-01-01', i);
      outcome.set(date, (i % 5) + 1);
      driver.set(date, ((i + 2) % 5) + 1);
    }
    expect(hasSufficientPairedData(outcome, driver)).toBe(false);
  });

  it('is false when there are exactly enough observations by count but they arrive on consecutive days spanning fewer than MIN_SPAN_DAYS elapsed days', () => {
    const outcome: DailySeries = new Map();
    const driver: DailySeries = new Map();
    // MIN_PAIRED_OBSERVATIONS consecutive daily entries span
    // (MIN_PAIRED_OBSERVATIONS - 1) elapsed days — one short of
    // MIN_SPAN_DAYS when the two constants are equal (both 21 today) —
    // "21 same-week data points from a single dense burst is not 'over
    // time'" (evidence.ts's own framing).
    for (let i = 0; i < MIN_PAIRED_OBSERVATIONS; i++) {
      const date = addDays('2026-01-01', i);
      outcome.set(date, (i % 5) + 1);
      driver.set(date, ((i + 2) % 5) + 1);
    }
    expect(hasSufficientPairedData(outcome, driver)).toBe(false);
  });

  it('is false when one side has no real variation (flat series)', () => {
    const outcome: DailySeries = new Map();
    const driver: DailySeries = new Map();
    for (let i = 0; i < MIN_PAIRED_OBSERVATIONS + 5; i++) {
      const date = addDays('2026-01-01', i);
      outcome.set(date, 3); // flat — every day the same value
      driver.set(date, ((i + 2) % 5) + 1);
    }
    expect(hasSufficientPairedData(outcome, driver)).toBe(false);
  });

  it('checks next-day pairing too, not just same-day', () => {
    // Only next-day pairing has enough real overlap: driver[d] pairs with
    // outcome[d+1], so build outcome shifted by one day relative to driver.
    const outcome: DailySeries = new Map();
    const driver: DailySeries = new Map();
    for (let i = 0; i < MIN_PAIRED_OBSERVATIONS + 5; i++) {
      driver.set(addDays('2026-01-01', i), (i % 5) + 1);
      outcome.set(addDays('2026-01-01', i + 1), ((i + 2) % 5) + 1);
    }
    expect(hasSufficientPairedData(outcome, driver)).toBe(true);
  });
});
