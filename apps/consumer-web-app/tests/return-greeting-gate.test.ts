/**
 * Root Presence System (Prompt 4), requirement 5: No-Guilt Return —
 * pure gate test (lib/return-greeting/gate.ts), no database involved.
 * Proves the return greeting only fires after a genuine gap, non-vacuous
 * at the exact threshold boundary.
 */
import { describe, expect, it } from 'vitest';
import { isEligibleForReturnGreeting } from '../lib/return-greeting/gate';
import { RETURN_GREETING_MIN_GAP_DAYS, RETURN_GREETING_TEXT } from '../lib/return-greeting/copy';

describe('isEligibleForReturnGreeting — only a genuine multi-day gap', () => {
  it('is never eligible for a member who has never checked in (null — nothing to return to)', () => {
    expect(isEligibleForReturnGreeting(null)).toBe(false);
  });

  it('is not eligible for a normal short break (0, 1, or 2 days)', () => {
    expect(isEligibleForReturnGreeting(0)).toBe(false);
    expect(isEligibleForReturnGreeting(1)).toBe(false);
    expect(isEligibleForReturnGreeting(2)).toBe(false);
  });

  it('is non-vacuous: exactly at and above the real threshold, it is eligible', () => {
    expect(isEligibleForReturnGreeting(RETURN_GREETING_MIN_GAP_DAYS)).toBe(true);
    expect(isEligibleForReturnGreeting(RETURN_GREETING_MIN_GAP_DAYS - 1)).toBe(false);
    expect(isEligibleForReturnGreeting(30)).toBe(true);
  });
});

describe('RETURN_GREETING_TEXT — no-guilt copy guard', () => {
  it('never mentions a day count, "missed", or "streak"', () => {
    expect(RETURN_GREETING_TEXT.toLowerCase()).not.toContain('missed');
    expect(RETURN_GREETING_TEXT.toLowerCase()).not.toContain('streak');
    expect(RETURN_GREETING_TEXT).not.toMatch(/\d/);
  });
});
