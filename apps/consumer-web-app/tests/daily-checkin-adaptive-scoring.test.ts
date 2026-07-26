import { describe, it, expect } from 'vitest';
import { recencyFactor, uncertaintyFactor, probeWeight } from '../lib/daily-checkin-adaptive/scoring';
import { RECENCY_CAP_DAYS } from '../lib/daily-checkin-adaptive/constants';

describe('recencyFactor', () => {
  it('grows with days since last asked', () => {
    expect(recencyFactor(1)).toBeLessThan(recencyFactor(5));
    expect(recencyFactor(5)).toBeLessThan(recencyFactor(10));
  });

  it('caps at RECENCY_CAP_DAYS', () => {
    expect(recencyFactor(RECENCY_CAP_DAYS)).toBe(recencyFactor(RECENCY_CAP_DAYS + 50));
  });

  it('treats "never asked" as maximally overdue', () => {
    expect(recencyFactor(null)).toBe(recencyFactor(RECENCY_CAP_DAYS));
  });
});

describe('uncertaintyFactor', () => {
  it('scores unknown and watching equally uncertain', () => {
    expect(uncertaintyFactor('unknown')).toBe(uncertaintyFactor('watching'));
  });

  it('scores implicated lower than unknown/watching but still nonzero', () => {
    expect(uncertaintyFactor('implicated')).toBeGreaterThan(0);
    expect(uncertaintyFactor('implicated')).toBeLessThan(uncertaintyFactor('unknown'));
  });

  it('scores ruled_out as exactly zero', () => {
    expect(uncertaintyFactor('ruled_out')).toBe(0);
  });
});

describe('probeWeight', () => {
  it('is a genuine product of all three factors — zero uncertainty zeroes the whole weight regardless of goal weight or recency', () => {
    expect(probeWeight(3, 14, 'ruled_out')).toBe(0);
  });

  it('a high-goal-weight, long-overdue, still-uncertain driver outscores a low-goal-weight, recently-asked one', () => {
    const highPriority = probeWeight(3, 14, 'unknown');
    const lowPriority = probeWeight(1, 1, 'watching');
    expect(highPriority).toBeGreaterThan(lowPriority);
  });

  it('an implicated driver still scores above zero (periodically reconfirmed, not dropped)', () => {
    expect(probeWeight(2, 5, 'implicated')).toBeGreaterThan(0);
  });
});
