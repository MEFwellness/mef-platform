/**
 * Dashboard Evolution (Prompt 5) — pure unit tests, no database involved,
 * for the three rule sets that make Home "never look identical twice"
 * without sacrificing its Tool-speed requirement: card prioritization
 * (requirement 3) and dynamic greetings (requirement 1). Every function
 * under test here is a pure function of already-fetched, real state —
 * see lib/dashboard/prioritization.ts and lib/dashboard/greeting.ts.
 */
import { describe, expect, it } from 'vitest';
import { orderTodayCards, NOTICING_CARD_ORDER } from '../lib/dashboard/prioritization';
import {
  GREETING_LINES,
  NEUTRAL_GREETING_LINES,
  buildGreetingLine,
  greetingBandFromWord,
  scoreDirectionFromChange,
} from '../lib/dashboard/greeting';

describe('orderTodayCards — given state X, the order is always Y', () => {
  it('promotes the check-in line to the lead slot when today has no check-in yet', () => {
    expect(orderTodayCards(false)).toEqual(['checkin_prompt', 'morning_brief']);
  });

  it('falls back to the base order once today is checked in, with Root\'s own brief leading', () => {
    expect(orderTodayCards(true)).toEqual(['morning_brief', 'checkin_prompt']);
  });

  it('is deterministic: the exact same state always produces the exact same order', () => {
    const first = orderTodayCards(false);
    const second = orderTodayCards(false);
    expect(first).toEqual(second);
  });

  it('never drops or duplicates a card — every card stays reachable in its usual section either way', () => {
    const allKeys = ['morning_brief', 'checkin_prompt'].sort();
    expect([...orderTodayCards(true)].sort()).toEqual(allKeys);
    expect([...orderTodayCards(false)].sort()).toEqual(allKeys);
  });

  it('carries no key for any block that has left this zone', () => {
    // 'wellness_reflection' (Today's Wellness) was removed from Home
    // outright and the numbers half of 'numbers_or_prompt' moved to the
    // Today tab, both in the 2026-08-14 cleanup pass. 'assigned_programs'
    // was promoted out of this zone entirely in the 2026-08-18 polish
    // pass: it is the page's hero now, rendered above Quick Actions, so a
    // leftover key here would mean a second copy of her program card.
    for (const order of [orderTodayCards(true), orderTodayCards(false)]) {
      expect(order).not.toContain('wellness_reflection');
      expect(order).not.toContain('numbers_or_prompt');
      expect(order).not.toContain('assigned_programs');
    }
  });
});

describe('NOTICING_CARD_ORDER — a new discovery moment outranks routine cards', () => {
  it('always ranks the discovery slot first, ahead of every routine card', () => {
    expect(NOTICING_CARD_ORDER[0]).toBe('discovery');
  });

  it('keeps every routine card present, just behind discovery', () => {
    expect(NOTICING_CARD_ORDER).toEqual([
      'discovery',
      'what_were_noticing',
      'root_map',
      'coaching_message',
      'recommendations',
    ]);
  });
});

describe('greetingBandFromWord', () => {
  it('maps each real greeting word to its band', () => {
    expect(greetingBandFromWord('Good morning')).toBe('morning');
    expect(greetingBandFromWord('Good afternoon')).toBe('afternoon');
    expect(greetingBandFromWord('Good evening')).toBe('evening');
  });
});

describe('buildGreetingLine', () => {
  it('never fabricates a check-in that does not exist: pending vs. done pick genuinely different lines', () => {
    const pending = buildGreetingLine({
      greetingWord: 'Good morning',
      hasCheckinToday: false,
      localDate: '2026-01-05',
    });
    const done = buildGreetingLine({
      greetingWord: 'Good morning',
      hasCheckinToday: true,
      localDate: '2026-01-05',
    });
    expect(pending).not.toBe(done);
  });

  it('is deterministic for a given day: the same real date and state always produce the same line', () => {
    const first = buildGreetingLine({
      greetingWord: 'Good evening',
      hasCheckinToday: false,
      localDate: '2026-03-11',
    });
    const second = buildGreetingLine({
      greetingWord: 'Good evening',
      hasCheckinToday: false,
      localDate: '2026-03-11',
    });
    expect(first).toBe(second);
  });

  it('is non-vacuous: rotates to a genuinely different line on at least one other day in the same band/state, proving this is not hardcoded to always return the same string', () => {
    const seen = new Set<string>();
    for (let day = 1; day <= 28; day++) {
      const localDate = `2026-04-${String(day).padStart(2, '0')}`;
      seen.add(
        buildGreetingLine({ greetingWord: 'Good morning', hasCheckinToday: false, localDate })
      );
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('every greeting line respects the App Copy Rule: no em dashes anywhere', () => {
    const localDates = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'];
    const bands: Array<'Good morning' | 'Good afternoon' | 'Good evening'> = [
      'Good morning',
      'Good afternoon',
      'Good evening',
    ];
    for (const greetingWord of bands) {
      for (const hasCheckinToday of [true, false]) {
        for (const localDate of localDates) {
          for (const scoreDirection of ['up', 'down', 'flat', null] as const) {
            const line = buildGreetingLine({
              greetingWord,
              hasCheckinToday,
              localDate,
              scoreDirection,
            });
            expect(line).not.toContain('—');
          }
        }
      }
    }
  });
});

/**
 * Copy-and-honesty pass (2026-08-14), fix 3. The hero printed "Good start
 * to the day" directly above a Root Score reading points down. The line
 * now branches on the very number the change pill renders.
 */
describe('buildGreetingLine — never contradicts the score printed below it', () => {
  const BANDS = ['Good morning', 'Good afternoon', 'Good evening'] as const;
  const DATES = ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05'];

  it('maps a real change value to a real direction, and nothing to null', () => {
    expect(scoreDirectionFromChange(3)).toBe('up');
    expect(scoreDirectionFromChange(-2)).toBe('down');
    expect(scoreDirectionFromChange(0)).toBe('flat');
    expect(scoreDirectionFromChange(null)).toBeNull();
    expect(scoreDirectionFromChange(undefined)).toBeNull();
  });

  it('never speaks a positive line on a day the score went down or stayed flat', () => {
    for (const greetingWord of BANDS) {
      const band = greetingBandFromWord(greetingWord);
      for (const hasCheckinToday of [true, false]) {
        const positives = GREETING_LINES[band][hasCheckinToday ? 'done' : 'pending'];
        const neutrals = NEUTRAL_GREETING_LINES[band][hasCheckinToday ? 'done' : 'pending'];
        for (const scoreDirection of ['down', 'flat'] as const) {
          for (const localDate of DATES) {
            const line = buildGreetingLine({
              greetingWord,
              hasCheckinToday,
              localDate,
              scoreDirection,
            });
            expect(neutrals).toContain(line);
            // The one line that started this fix, and every other line
            // that only makes sense over a number that went up.
            const positiveOnly = positives.filter((p) => !neutrals.includes(p));
            expect(positiveOnly).not.toContain(line);
          }
        }
      }
    }
  });

  it('the specific line that contradicted the number can no longer appear on a down day', () => {
    for (const localDate of DATES) {
      expect(
        buildGreetingLine({
          greetingWord: 'Good morning',
          hasCheckinToday: true,
          localDate,
          scoreDirection: 'down',
        })
      ).not.toBe('Good start to the day.');
    }
  });

  it('keeps the warm lines for an up day, and for a day with no change shown at all', () => {
    for (const greetingWord of BANDS) {
      const band = greetingBandFromWord(greetingWord);
      for (const hasCheckinToday of [true, false]) {
        const positives = GREETING_LINES[band][hasCheckinToday ? 'done' : 'pending'];
        for (const scoreDirection of ['up', null] as const) {
          for (const localDate of DATES) {
            expect(positives).toContain(
              buildGreetingLine({ greetingWord, hasCheckinToday, localDate, scoreDirection })
            );
          }
        }
      }
    }
  });

  it('defaults to the ordinary lines when no direction is passed at all, so no caller changes behavior by accident', () => {
    const withoutDirection = buildGreetingLine({
      greetingWord: 'Good morning',
      hasCheckinToday: true,
      localDate: '2026-05-01',
    });
    const withNull = buildGreetingLine({
      greetingWord: 'Good morning',
      hasCheckinToday: true,
      localDate: '2026-05-01',
      scoreDirection: null,
    });
    expect(withoutDirection).toBe(withNull);
  });

  it('a neutral line still branches honestly on whether she has checked in', () => {
    const pending = buildGreetingLine({
      greetingWord: 'Good morning',
      hasCheckinToday: false,
      localDate: '2026-05-01',
      scoreDirection: 'down',
    });
    const done = buildGreetingLine({
      greetingWord: 'Good morning',
      hasCheckinToday: true,
      localDate: '2026-05-01',
      scoreDirection: 'down',
    });
    expect(pending).not.toBe(done);
    // Never claims a check-in that does not exist.
    expect(pending.toLowerCase()).not.toContain('thanks for checking in');
  });
});
