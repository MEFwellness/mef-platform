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
  pickMemoryCallback,
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

/**
 * Copy-and-honesty pass (2026-08-14), fix 1. This builder produced the
 * real, shipped sentence "You've been checking in with me for 10 days now,
 * 1 check-in so far." Both numbers were true, and putting them side by
 * side turned a memory into arithmetic done at her expense: Root pointing
 * out a gap she can already see.
 *
 * The fix branches on real state rather than softening the words: the two
 * numbers may only appear in the same sentence when the rhythm behind them
 * is genuinely steady. Everything below asserts that boundary, and that
 * nothing here ever claims a check-in she did not log.
 */
describe('buildTenureCallback — a low count is handled warmly, never as shaming math', () => {
  it('the exact sentence that started this fix can no longer be produced', () => {
    const result = buildTenureCallback({
      totalCheckins: 1,
      firstCheckinLocalDate: '2026-01-01',
      todayLocalDate: '2026-01-11',
    });
    expect(result).not.toBe("You've been checking in with me for 10 days now, 1 check-in so far.");
    expect(result).not.toContain('10 days');
    expect(result).toContain('first check-in');
  });

  it('never sets a day span next to a low count, at any scale', () => {
    const cases = [
      { totalCheckins: 1, firstCheckinLocalDate: '2026-01-01', todayLocalDate: '2026-01-11' },
      { totalCheckins: 2, firstCheckinLocalDate: '2026-01-01', todayLocalDate: '2026-01-20' },
      { totalCheckins: 4, firstCheckinLocalDate: '2026-01-01', todayLocalDate: '2026-03-01' },
    ];
    for (const ctx of cases) {
      const result = buildTenureCallback(ctx);
      expect(result).not.toBeNull();
      expect(result).not.toMatch(/\d+ days? now/);
      // One check-in is named in words ("your first check-in"), everything
      // above it by its real count. Neither ever gets a denominator.
      expect(result).toContain(ctx.totalCheckins === 1 ? 'first check-in' : `${ctx.totalCheckins} check-in`);
    }
  });

  it('still names both numbers when she has genuinely been steady, because there it is recognition', () => {
    const result = buildTenureCallback({
      totalCheckins: 9,
      firstCheckinLocalDate: '2026-01-01',
      todayLocalDate: '2026-01-11',
    });
    expect(result).toBe("You've been checking in with me for 10 days now, 9 check-ins so far.");
  });

  it('never invents a count, and never claims more than she logged', () => {
    // Every one of these is a low count against a 31 day span, so the
    // sentence is only ever allowed to carry her own count.
    for (const totalCheckins of [1, 2, 3, 5, 8, 13, 15]) {
      const result = buildTenureCallback({
        totalCheckins,
        firstCheckinLocalDate: '2026-01-01',
        todayLocalDate: '2026-02-01',
      });
      expect(result).not.toBeNull();
      expect(result).toContain(totalCheckins === 1 ? 'first check-in' : String(totalCheckins));
      expect(result).not.toContain('—');
      // Every numeral in the sentence is her own real count, never a
      // second number she would have to compare it against.
      const numerals = (result!.match(/\d+/g) ?? []).map(Number);
      for (const numeral of numerals) expect(numeral).toBe(totalCheckins);
    }
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

describe('pickMemoryCallback — Dashboard Evolution (Prompt 5), requirement 7: the two dormant callbacks are now reachable, in priority order', () => {
  it('is non-vacuous: a real day-3 contrast wins over both a real finding and a real tenure line', () => {
    const result = pickMemoryCallback(
      'On day 3 of your Core Values Snapshot experiment, you told me it was going well.',
      '2 weeks ago, I noticed something that still holds: Your sleep and stress move together.',
      "You've been checking in with me for 9 days now, 7 check-ins so far."
    );
    expect(result).toBe('On day 3 of your Core Values Snapshot experiment, you told me it was going well.');
  });

  it('is non-vacuous: with no day-3 contrast, a real resurfaced finding wins over tenure', () => {
    const result = pickMemoryCallback(
      null,
      '2 weeks ago, I noticed something that still holds: Your sleep and stress move together.',
      "You've been checking in with me for 9 days now, 7 check-ins so far."
    );
    expect(result).toBe(
      '2 weeks ago, I noticed something that still holds: Your sleep and stress move together.'
    );
  });

  it('falls all the way back to tenure when neither of the two dormant callbacks has real data', () => {
    const result = pickMemoryCallback(null, null, "You've been checking in with me for 9 days now, 7 check-ins so far.");
    expect(result).toBe("You've been checking in with me for 9 days now, 7 check-ins so far.");
  });

  it('returns null (never a fabricated line) when none of the three has real data', () => {
    expect(pickMemoryCallback(null, null, null)).toBeNull();
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
