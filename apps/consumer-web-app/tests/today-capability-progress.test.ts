/**
 * Today page redesign — real unit tests (not a source scan) for
 * lib/today/capability.ts's capabilityProgress(), the pure function
 * behind the Accomplished Zone's "Earned Capability" card. The required
 * threshold is imported directly from the correlation engine's own
 * MIN_PAIRED_OBSERVATIONS constant (lib/correlation-engine/evidence.ts)
 * rather than copied, so a future change to that gate can't silently
 * drift out of sync with what Today tells the member.
 */
import { describe, it, expect } from 'vitest';
import { capabilityProgress, CAPABILITY_LOG_DAYS_REQUIRED } from '@/lib/today/capability';
import { MIN_PAIRED_OBSERVATIONS } from '@/lib/correlation-engine/evidence';

describe('capabilityProgress', () => {
  it('required always equals the real correlation-engine constant, not an independently chosen number', () => {
    expect(CAPABILITY_LOG_DAYS_REQUIRED).toBe(MIN_PAIRED_OBSERVATIONS);
    expect(capabilityProgress(0).required).toBe(MIN_PAIRED_OBSERVATIONS);
  });

  it('a brand-new member (1 check-in) is far from unlocked, with an honest remaining count', () => {
    const progress = capabilityProgress(1);
    expect(progress.unlocked).toBe(false);
    expect(progress.remaining).toBe(MIN_PAIRED_OBSERVATIONS - 1);
  });

  it('3 check-ins across 10 days (the brief\'s explicit thin-data example) still reads as real, non-zero progress', () => {
    const progress = capabilityProgress(3);
    expect(progress.unlocked).toBe(false);
    expect(progress.loggedDays).toBe(3);
    expect(progress.remaining).toBe(MIN_PAIRED_OBSERVATIONS - 3);
    expect(progress.remaining).toBeGreaterThan(0);
  });

  it('unlocks exactly at the real threshold, never one day early or late', () => {
    expect(capabilityProgress(MIN_PAIRED_OBSERVATIONS - 1).unlocked).toBe(false);
    expect(capabilityProgress(MIN_PAIRED_OBSERVATIONS).unlocked).toBe(true);
  });

  it('stays unlocked well past the threshold (30+ check-ins) and never reports negative remaining', () => {
    const progress = capabilityProgress(45);
    expect(progress.unlocked).toBe(true);
    expect(progress.remaining).toBe(0);
  });

  it('never returns a negative loggedDays or remaining even for pathological input', () => {
    const progress = capabilityProgress(-5);
    expect(progress.loggedDays).toBe(0);
    expect(progress.remaining).toBe(MIN_PAIRED_OBSERVATIONS);
    expect(progress.unlocked).toBe(false);
  });
});
