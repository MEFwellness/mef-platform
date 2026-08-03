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
import { buildGreetingLine, greetingBandFromWord } from '../lib/dashboard/greeting';

describe('orderTodayCards — given state X, the order is always Y', () => {
  it('promotes the check-in prompt to the lead slot when today has no check-in yet', () => {
    expect(orderTodayCards(false)).toEqual([
      'numbers_or_prompt',
      'morning_brief',
      'assigned_programs',
      'wellness_reflection',
    ]);
  });

  it('promotes real progress/reflection content to the lead slot once today is checked in', () => {
    expect(orderTodayCards(true)).toEqual([
      'wellness_reflection',
      'morning_brief',
      'assigned_programs',
      'numbers_or_prompt',
    ]);
  });

  it('is deterministic: the exact same state always produces the exact same order', () => {
    const first = orderTodayCards(false);
    const second = orderTodayCards(false);
    expect(first).toEqual(second);
  });

  it('never drops or duplicates a card — every card stays reachable in its usual section either way', () => {
    const allKeys = ['morning_brief', 'assigned_programs', 'wellness_reflection', 'numbers_or_prompt'].sort();
    expect([...orderTodayCards(true)].sort()).toEqual(allKeys);
    expect([...orderTodayCards(false)].sort()).toEqual(allKeys);
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
          const line = buildGreetingLine({ greetingWord, hasCheckinToday, localDate });
          expect(line).not.toContain('—');
        }
      }
    }
  });
});
