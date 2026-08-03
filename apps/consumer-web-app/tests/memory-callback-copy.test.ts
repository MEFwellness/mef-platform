/**
 * Root Presence System (Prompt 4), requirement 4: Memory Callbacks — pure
 * copy-function tests, no database involved (lib/memory-callback/copy.ts
 * takes typed contexts, never fetches). The Honest Discovery Rule guard:
 * every builder must return null, never a fabricated sentence, when its
 * context is null or the context's own data doesn't actually support a
 * claim.
 */
import { describe, expect, it } from 'vitest';
import {
  appendCallback,
  buildDay3ContrastCallback,
  buildFindingCallback,
  buildGoalCallback,
  buildTenureCallback,
} from '../lib/memory-callback/copy';

describe('buildGoalCallback — the Honest Discovery Rule guard', () => {
  it('returns null for a member with no recorded goal selection at all', () => {
    expect(buildGoalCallback(null)).toBeNull();
  });

  it('is non-vacuous: a real goal selection produces a real sentence naming it', () => {
    const result = buildGoalCallback({
      primaryGoal: 'reduce_stress',
      goalsOther: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(result).not.toBeNull();
    expect(result).toContain('reduce stress');
  });

  it('quotes her own free text verbatim when goals_other is recorded, never rewriting it', () => {
    const result = buildGoalCallback({
      primaryGoal: 'something_else',
      goalsOther: 'getting back to hiking with my kids',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(result).toContain('getting back to hiking with my kids');
  });

  it('returns null when the primary goal key is unrecognized rather than guessing a label', () => {
    expect(
      buildGoalCallback({ primaryGoal: 'not_a_real_key', goalsOther: null, createdAt: '2026-01-01T00:00:00.000Z' })
    ).toBeNull();
  });
});

describe('buildTenureCallback — never fires for a member with zero check-ins', () => {
  it('returns null for zero check-ins (nothing to remember yet)', () => {
    expect(
      buildTenureCallback({ totalCheckins: 0, firstCheckinLocalDate: null, todayLocalDate: '2026-01-10' })
    ).toBeNull();
  });

  it('returns null for a null context', () => {
    expect(buildTenureCallback(null)).toBeNull();
  });

  it('is non-vacuous: a real tenure produces the real count and real day span, never rounded or invented', () => {
    const result = buildTenureCallback({
      totalCheckins: 14,
      firstCheckinLocalDate: '2026-01-01',
      todayLocalDate: '2026-01-10',
    });
    expect(result).toContain('14 check-ins');
    expect(result).toContain('9 days');
  });

  it('handles a first-day member (0 elapsed days) without saying "0 days"', () => {
    const result = buildTenureCallback({
      totalCheckins: 1,
      firstCheckinLocalDate: '2026-01-10',
      todayLocalDate: '2026-01-10',
    });
    expect(result).not.toContain('0 day');
    expect(result).toContain('1 check-in');
  });
});

describe('buildDay3ContrastCallback', () => {
  it('returns null with no day-3 context', () => {
    expect(buildDay3ContrastCallback(null)).toBeNull();
  });

  it('states her real logged answer honestly, for each of the three real values', () => {
    expect(
      buildDay3ContrastCallback({ day3Response: 'going_well', experienceLabel: 'Core Values Snapshot experiment' })
    ).toContain('going well');
    expect(
      buildDay3ContrastCallback({ day3Response: 'mixed', experienceLabel: 'Life Signal Check experiment' })
    ).toContain('mixed');
    expect(
      buildDay3ContrastCallback({ day3Response: 'not_started', experienceLabel: 'Readiness Pulse experiment' })
    ).toContain("hadn't started");
  });
});

describe('buildFindingCallback — never claims "weeks ago" for something too recent', () => {
  it('returns null with no finding context', () => {
    expect(buildFindingCallback(null)).toBeNull();
  });

  it('returns null when the finding is less than a week old (would misleadingly read as "0 weeks ago")', () => {
    const result = buildFindingCallback({
      memberSentence: 'Your sleep and stress move together.',
      computedAt: '2026-01-08T00:00:00.000Z',
      todayLocalDate: '2026-01-10',
    });
    expect(result).toBeNull();
  });

  it('is non-vacuous: a real finding at least a week old produces a real week count and the real sentence', () => {
    const result = buildFindingCallback({
      memberSentence: 'Your sleep and stress move together.',
      computedAt: '2026-01-01T00:00:00.000Z',
      todayLocalDate: '2026-01-15',
    });
    expect(result).not.toBeNull();
    expect(result).toContain('2 weeks ago');
    expect(result).toContain('Your sleep and stress move together.');
  });
});

describe('appendCallback', () => {
  it('returns the base line unchanged when there is no callback', () => {
    expect(appendCallback('Seven days in.', null)).toBe('Seven days in.');
  });

  it('appends a real callback with a single separating space, never a double space or trailing empty sentence', () => {
    expect(appendCallback('Seven days in.', 'You told me sleep mattered most.')).toBe(
      'Seven days in. You told me sleep mattered most.'
    );
  });
});
