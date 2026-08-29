/**
 * The Weekly Reflection, held shut at every place it could quietly stop
 * being what it is.
 *
 * Five things the brief names as load-bearing, and this file proves each
 * of them over the real modules rather than over a paraphrase:
 *
 *   1. The tier IS the gate. Program in, everyone else out.
 *   2. The window is Friday through Sunday, in HER calendar.
 *   3. One completion per week, and the second submit is not a second row.
 *   4. The thin-data recap is designed, not degraded.
 *   5. The five questions are the same five every week, and a required
 *      one cannot exist without the sentence shown when it blocks.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasWeeklyReflectionAccess, WEEKLY_REFLECTION_TIER } from '@/lib/weekly-reflection/access';
import { ACCESS_TIERS, type AccessTier, type MemberAccessFacts } from '@/lib/membership/types';
import {
  isReflectionWindowOpen,
  reflectionWeekStartFor,
  recapRangeFor,
  weekdayIndexFor,
} from '@/lib/weekly-reflection/week';
import {
  buildReflectionRecap,
  renderReflectionRecap,
  sanitizeRecap,
  selectRecapSignals,
  recapIntro,
  MIN_CHECKINS_FOR_OBSERVATIONS,
  MAX_RECAP_OBSERVATIONS,
} from '@/lib/weekly-reflection/recap';
import {
  WEEKLY_REFLECTION_QUESTIONS,
  REFLECTION_QUESTION_KEYS,
  WEEKLY_REFLECTION_QUESTIONS_VERSION,
  firstBlockedReason,
  isAnswered,
  sanitizeReflectionAnswers,
  weekOverallLabel,
} from '@/lib/weekly-reflection/questions';
import { weeklyReflectionPopupMessageKey } from '@/lib/root-popup-messages/data';
import type { LongitudinalSignal } from '@/lib/longitudinal-intelligence/types';

const ROOT = join(__dirname, '..');

function facts(tier: AccessTier, overrides: Partial<MemberAccessFacts['subscription']> = {}): MemberAccessFacts {
  return {
    isTest: false,
    subscription: {
      memberId: 'member-1',
      tier,
      source: 'manual',
      status: 'active',
      fullAccess: false,
      trialStartedAt: '2026-08-01T00:00:00.000Z',
      trialEndsAt: '2026-08-31T00:00:00.000Z',
      ...overrides,
    },
  } as MemberAccessFacts;
}

function signal(overrides: Partial<LongitudinalSignal>): LongitudinalSignal {
  return {
    signalKey: 'checkin_metric::sleep',
    signalKind: 'checkin_metric',
    signalLabel: 'sleep',
    state: 'improving',
    tier: 2,
    occurrenceCount: 2,
    confidence: 0.6,
    firstObservedAt: '2026-08-01',
    lastObservedAt: '2026-08-28',
    evidenceSummary: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------
// 1. The tier is the gate.
// ---------------------------------------------------------------------

describe('who is offered the Weekly Reflection', () => {
  it('the program tier, and only the program tier', () => {
    expect(WEEKLY_REFLECTION_TIER).toBe('program');
    expect(hasWeeklyReflectionAccess(facts('program'))).toBe(true);
  });

  it('every other tier in the vocabulary is turned away, exhaustively', () => {
    // Exhaustive over ACCESS_TIERS rather than a hand-written list of four,
    // so a sixth tier added to migration 159's vocabulary tomorrow fails
    // this test instead of silently defaulting to "offered".
    const offered = ACCESS_TIERS.filter((tier) => hasWeeklyReflectionAccess(facts(tier)));
    expect(offered).toEqual(['program']);
  });

  it('a monthly member is turned away even with full access set', () => {
    // full_access is the "whole platform" grant that sits on top of a
    // tier. It deliberately does not open this, so that "who is on the 24
    // week program" has one answer rather than two.
    expect(hasWeeklyReflectionAccess(facts('monthly', { fullAccess: true }))).toBe(false);
  });

  it('a program tier that is expired or canceled is turned away', () => {
    expect(hasWeeklyReflectionAccess(facts('program', { status: 'expired' }))).toBe(false);
    expect(hasWeeklyReflectionAccess(facts('program', { status: 'canceled' }))).toBe(false);
  });

  it('fails SHUT, unlike the app-wide lock: no row, no facts, no offer', () => {
    expect(hasWeeklyReflectionAccess(null)).toBe(false);
    expect(hasWeeklyReflectionAccess({ subscription: null, isTest: false })).toBe(false);
    expect(hasWeeklyReflectionAccess({ subscription: null, isTest: true })).toBe(false);
  });
});

// ---------------------------------------------------------------------
// 2. The window.
// ---------------------------------------------------------------------

describe('the Friday to Sunday window', () => {
  // 2026-08-28 is a Friday. The seven days that follow it cover a whole
  // week, one weekday each, so this walks the real calendar rather than
  // asserting three hand-picked days.
  const WEEK = [
    { date: '2026-08-24', day: 'Monday', open: false },
    { date: '2026-08-25', day: 'Tuesday', open: false },
    { date: '2026-08-26', day: 'Wednesday', open: false },
    { date: '2026-08-27', day: 'Thursday', open: false },
    { date: '2026-08-28', day: 'Friday', open: true },
    { date: '2026-08-29', day: 'Saturday', open: true },
    { date: '2026-08-30', day: 'Sunday', open: true },
    { date: '2026-08-31', day: 'the next Monday', open: false },
  ];

  for (const { date, day, open } of WEEK) {
    it(`${day} (${date}) is ${open ? 'open' : 'closed'}`, () => {
      expect(isReflectionWindowOpen(date)).toBe(open);
    });
  }

  it('all three open days resolve to the SAME Friday, which is what makes them one week', () => {
    expect(reflectionWeekStartFor('2026-08-28')).toBe('2026-08-28');
    expect(reflectionWeekStartFor('2026-08-29')).toBe('2026-08-28');
    expect(reflectionWeekStartFor('2026-08-30')).toBe('2026-08-28');
  });

  it('the following Friday is a different week, so the experience returns', () => {
    expect(reflectionWeekStartFor('2026-09-04')).toBe('2026-09-04');
    expect(weeklyReflectionPopupMessageKey('2026-09-04')).not.toBe(
      weeklyReflectionPopupMessageKey('2026-08-28')
    );
  });

  it('a closed day has no week start at all, so there is no second "is it open" flag to disagree', () => {
    expect(reflectionWeekStartFor('2026-08-26')).toBeNull();
  });

  it('crosses a month boundary and a year boundary without drifting', () => {
    // 2026-10-02 is a Friday; its Sunday is 2026-10-04. 2027-01-01 is a
    // Friday; its Saturday and Sunday fall in the new year.
    expect(reflectionWeekStartFor('2026-10-04')).toBe('2026-10-02');
    expect(weekdayIndexFor('2027-01-01')).toBe(5);
    expect(reflectionWeekStartFor('2027-01-03')).toBe('2027-01-01');
  });

  it('the recap window is the seven days ENDING on that Friday, frozen for the whole weekend', () => {
    // Anchored on the Friday and not on "today", so Saturday and Sunday
    // read back the identical week she read on Friday, and so the coach
    // reading it on Monday sees the same seven days.
    for (const localDate of ['2026-08-28', '2026-08-29', '2026-08-30']) {
      const weekStart = reflectionWeekStartFor(localDate)!;
      expect(recapRangeFor(weekStart)).toEqual({ from: '2026-08-22', to: '2026-08-28' });
    }
  });
});

// ---------------------------------------------------------------------
// 3. Once per week.
// ---------------------------------------------------------------------

describe('once per week, enforced by the row rather than by a schedule', () => {
  it('the pop-up key carries the Friday, so this week can be dismissed and next week cannot', () => {
    expect(weeklyReflectionPopupMessageKey('2026-08-28')).toBe('weekly_reflection:2026-08-28');
  });

  it('the migration puts the once-per-week rule in the database, not only in code', () => {
    const sql = readFileSync(
      join(ROOT, '..', '..', 'supabase/migrations/00000000000189_weekly_reflection.sql'),
      'utf8'
    );
    expect(sql).toContain('unique (member_id, week_start)');
    // A double submit must not be able to produce a second row even if two
    // requests race past the read.
    expect(sql).toContain('member_weekly_reflections');
  });

  it('the submit path is an insert, never an upsert, so a second submit cannot overwrite her words', () => {
    const source = readFileSync(join(ROOT, 'lib/weekly-reflection/data.ts'), 'utf8');
    expect(source).toContain('.insert(');
    expect(source).not.toContain('.upsert(');
  });
});

// ---------------------------------------------------------------------
// 4. The thin-data recap.
// ---------------------------------------------------------------------

describe('the recap, and the thin week it was designed around first', () => {
  const weekStart = '2026-08-28';
  const patternStates = [
    signal({ signalKey: 'checkin_metric::sleep', signalLabel: 'sleep', state: 'improving', tier: 3, confidence: 0.8 }),
    signal({ signalKey: 'checkin_metric::energy', signalLabel: 'energy', state: 'worsening', tier: 2, confidence: 0.7 }),
    signal({ signalKey: 'checkin_metric::mood', signalLabel: 'mood', state: 'stable', tier: 1, confidence: 0.4 }),
    signal({ signalKey: 'checkin_metric::pain', signalLabel: 'pain', state: 'improving', tier: 1, confidence: 0.3 }),
  ];

  it('two check-ins: the count is said warmly, in full, and NO observation is shown', () => {
    const recap = buildReflectionRecap({
      weekStart,
      checkinLocalDates: ['2026-08-26', '2026-08-27'],
      patternStates,
    });
    expect(recap.checkinCount).toBe(2);
    expect(recap.thin).toBe(true);
    expect(recap.signals).toEqual([]);

    const rendered = renderReflectionRecap(recap);
    expect(rendered.intro).toBe(
      'We only have 2 days of check-ins in the last 7 days, so here is what we saw.'
    );
    expect(rendered.observations).toEqual([]);
    // Never an empty section: something warm stands in its place.
    expect(rendered.emptyNote).toBeTruthy();
  });

  it('zero check-ins is a real week too, and is said without a zero framed as failure', () => {
    const rendered = renderReflectionRecap(
      buildReflectionRecap({ weekStart, checkinLocalDates: [], patternStates })
    );
    expect(rendered.checkinCount).toBe(0);
    expect(rendered.intro).toContain('Your own words below are the whole picture');
    expect(rendered.intro).not.toMatch(/\b0\b/);
    expect(rendered.observations).toEqual([]);
  });

  it('one check-in reads as a day, not as days', () => {
    expect(recapIntro(1)).toContain('1 day of check-ins');
    expect(recapIntro(1)).not.toContain('1 days');
  });

  it('every counted claim names the window it counted', () => {
    for (const count of [0, 1, 2, 3, 7]) {
      expect(recapIntro(count)).toContain('last 7 days');
    }
  });

  it('three check-ins is the floor at which observations are allowed at all', () => {
    expect(MIN_CHECKINS_FOR_OBSERVATIONS).toBe(3);
    const recap = buildReflectionRecap({
      weekStart,
      checkinLocalDates: ['2026-08-26', '2026-08-27', '2026-08-28'],
      patternStates,
    });
    expect(recap.thin).toBe(false);
    expect(recap.signals.length).toBeGreaterThan(0);
  });

  it('at most three observations, strongest tier first', () => {
    const recap = buildReflectionRecap({
      weekStart,
      checkinLocalDates: ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27'],
      patternStates,
    });
    expect(recap.signals).toHaveLength(MAX_RECAP_OBSERVATIONS);
    expect(recap.signals.map((s) => s.tier)).toEqual([3, 2, 1]);
  });

  it('only days INSIDE the seven day window are counted, and each day counts once', () => {
    const recap = buildReflectionRecap({
      weekStart,
      checkinLocalDates: [
        '2026-08-21', // the day before the window opens
        '2026-08-22', // the first day of the window
        '2026-08-28',
        '2026-08-28', // the same day twice
        '2026-08-29', // after the anchor Friday
      ],
      patternStates: [],
    });
    expect(recap.checkinCount).toBe(2);
  });

  it('nothing the engine has not qualified can reach the screen', () => {
    // A signal with no tier and no fixed-phrase state is not eligible, and
    // an 'insufficient_data' signal is dropped outright rather than
    // rendered as a hedge under a heading that just said the day count.
    const selected = selectRecapSignals([
      signal({ signalKey: 'checkin_metric::sleep', tier: null, state: 'improving' }),
      signal({ signalKey: 'checkin_metric::stress', state: 'insufficient_data', tier: 1 }),
    ]);
    expect(selected).toEqual([]);
  });

  it('a registry finding is not a "this week" observation, so it never appears here', () => {
    expect(
      selectRecapSignals([
        signal({ signalKey: 'registry::sleep::poor_sleep', signalKind: 'registry_finding', tier: 3 }),
      ])
    ).toEqual([]);
  });

  it('conflicting comes first, and at most once, because it is the honest opening', () => {
    const selected = selectRecapSignals([
      signal({ signalKey: 'checkin_metric::sleep', tier: 3, state: 'improving' }),
      signal({ signalKey: 'checkin_metric::energy', tier: null, state: 'conflicting' }),
      signal({ signalKey: 'checkin_metric::mood', tier: null, state: 'conflicting' }),
    ]);
    expect(selected[0]?.state).toBe('conflicting');
    expect(selected.filter((s) => s.state === 'conflicting')).toHaveLength(1);
  });

  it('sentences come from the three-tier language module, never from this feature', () => {
    const rendered = renderReflectionRecap(
      buildReflectionRecap({
        weekStart,
        checkinLocalDates: ['2026-08-24', '2026-08-25', '2026-08-26'],
        patternStates: [signal({ tier: 3, state: 'worsening' })],
      })
    );
    expect(rendered.observations).toHaveLength(1);
    expect(rendered.observations[0]!.label).toBe('Sleep');
    expect(rendered.observations[0]!.tierLabel).toBe('Qualified pattern');
    // Correlation-safe voice, from lib/longitudinal-intelligence/copy.ts.
    expect(rendered.observations[0]!.sentence).toContain('tends to be trending');
    expect(rendered.observations[0]!.sentence).not.toContain('causes');
  });

  it('what is stored is descriptors, and the words are rendered from them at read time', () => {
    const recap = buildReflectionRecap({
      weekStart,
      checkinLocalDates: ['2026-08-24', '2026-08-25', '2026-08-26'],
      patternStates: [signal({ tier: 3, state: 'improving' })],
    });
    const stored = JSON.parse(JSON.stringify(recap));
    // Nothing member-facing is in the stored object: slugs and numbers only.
    expect(JSON.stringify(stored)).not.toContain('tends to');
    // And a round trip through the database renders the identical words.
    expect(renderReflectionRecap(sanitizeRecap(stored)!)).toEqual(renderReflectionRecap(recap));
  });

  it('a hand-edited row is dropped down to what the vocabulary permits, never rendered half way', () => {
    expect(sanitizeRecap(null)).toBeNull();
    expect(sanitizeRecap({ checkinCount: 4 })).toBeNull();

    const cleaned = sanitizeRecap({
      weekStart,
      from: '2026-08-22',
      to: '2026-08-28',
      checkinCount: 4,
      signals: [
        { signalKey: 'checkin_metric::sleep', signalLabel: 'sleep', state: 'not_a_state', tier: 3 },
        { signalKey: 'checkin_metric::energy', signalLabel: 'energy', state: 'improving', tier: 9 },
      ],
    });
    expect(cleaned).not.toBeNull();
    // The invalid state is dropped; the out-of-range tier falls back to the
    // hedged, untiered rendering rather than being trusted.
    expect(cleaned!.signals).toHaveLength(1);
    expect(cleaned!.signals[0]!.tier).toBeNull();
  });
});

// ---------------------------------------------------------------------
// 5. The five questions.
// ---------------------------------------------------------------------

describe('the five spine questions', () => {
  it('are five, with stable keys, at a stated version', () => {
    expect(REFLECTION_QUESTION_KEYS).toEqual([
      'week_overall',
      'what_helped',
      'what_got_in_the_way',
      'body_response',
      'next_week_change',
    ]);
    expect(WEEKLY_REFLECTION_QUESTIONS).toHaveLength(5);
    expect(WEEKLY_REFLECTION_QUESTIONS_VERSION).toBe(1);
  });

  it('question 1 is a scale with WORDS, not bare numbers', () => {
    const first = WEEKLY_REFLECTION_QUESTIONS[0]!;
    expect(first.kind).toBe('scale');
    if (first.kind !== 'scale') throw new Error('unreachable');
    expect(first.options).toHaveLength(5);
    for (const option of first.options) {
      expect(option.label.trim().length).toBeGreaterThan(0);
      expect(option.label).not.toMatch(/^\d+$/);
    }
    expect(weekOverallLabel(3)).toBe('Mixed');
    expect(weekOverallLabel(9)).toBeNull();
  });

  it('every required question carries the sentence shown when Continue is disabled', () => {
    // The rule made structural: a question cannot be marked blocking
    // without also supplying the line the member reads.
    for (const question of WEEKLY_REFLECTION_QUESTIONS) {
      expect(question.blockedReason.trim().length).toBeGreaterThan(0);
      expect(question.blockedReason).not.toContain('—');
    }
  });

  it('the helper sentence shown is the FIRST unanswered question\'s own', () => {
    expect(firstBlockedReason({})).toBe(WEEKLY_REFLECTION_QUESTIONS[0]!.blockedReason);
    expect(firstBlockedReason({ week_overall: 4 })).toBe(
      WEEKLY_REFLECTION_QUESTIONS[1]!.blockedReason
    );
    expect(
      firstBlockedReason({
        week_overall: 4,
        what_helped: 'Sleep',
        what_got_in_the_way: 'Travel',
        body_response: 'Tired',
        next_week_change: 'Earlier nights',
      })
    ).toBeNull();
  });

  it('whitespace is not an answer, and an out-of-range scale value is not one either', () => {
    const scale = WEEKLY_REFLECTION_QUESTIONS[0]!;
    const text = WEEKLY_REFLECTION_QUESTIONS[1]!;
    expect(isAnswered(text, '   ')).toBe(false);
    expect(isAnswered(text, 'a')).toBe(true);
    expect(isAnswered(scale, 0)).toBe(false);
    expect(isAnswered(scale, 6)).toBe(false);
    expect(isAnswered(scale, 3.5)).toBe(false);
    expect(isAnswered(scale, 3)).toBe(true);
  });

  it('the server rejects an incomplete or out-of-range submission outright', () => {
    expect(sanitizeReflectionAnswers(null)).toBeNull();
    expect(sanitizeReflectionAnswers({ week_overall: 4 })).toBeNull();
    expect(
      sanitizeReflectionAnswers({
        week_overall: 9,
        what_helped: 'a',
        what_got_in_the_way: 'b',
        body_response: 'c',
        next_week_change: 'd',
      })
    ).toBeNull();
  });

  it('a complete submission is trimmed, capped, and stripped of anything not one of the five', () => {
    const clean = sanitizeReflectionAnswers({
      week_overall: 4,
      what_helped: '  Walking every morning  ',
      what_got_in_the_way: 'x'.repeat(900),
      body_response: 'Sore knees',
      next_week_change: 'Earlier nights',
      injected_key: 'should not survive',
    });
    expect(clean).not.toBeNull();
    expect(clean!.what_helped).toBe('Walking every morning');
    expect(clean!.what_got_in_the_way).toHaveLength(400);
    expect(Object.keys(clean!).sort()).toEqual([...REFLECTION_QUESTION_KEYS].sort());
  });
});

// ---------------------------------------------------------------------
// The copy rules, over the real files.
// ---------------------------------------------------------------------

describe('member-facing copy', () => {
  const FILES = [
    'lib/weekly-reflection/copy.ts',
    'lib/weekly-reflection/questions.ts',
    'lib/weekly-reflection/recap.ts',
  ];

  it('no em dash in any string a member reads', () => {
    // The repo-wide guard (tests/no-em-dash-guard.test.ts) walks the real
    // syntax tree and covers these too. This is the feature-local statement
    // of the same rule, kept because copy for this experience arrives as
    // one block and is easy to paste in from elsewhere.
    for (const file of FILES) {
      const source = readFileSync(join(ROOT, file), 'utf8');
      for (const [index, line] of source.split('\n').entries()) {
        if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) continue;
        expect(line.includes('—'), `${file}:${index + 1}`).toBe(false);
      }
    }
  });

  it('the closing screen promises only what is true today', () => {
    const source = readFileSync(join(ROOT, 'lib/weekly-reflection/copy.ts'), 'utf8');
    expect(source).toContain('Your coach will read this with you');
    expect(source.toLowerCase()).not.toContain('coming soon');
  });
});
