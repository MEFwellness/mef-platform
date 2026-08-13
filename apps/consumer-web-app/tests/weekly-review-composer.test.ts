/**
 * The Weekly Root Review — guard tests for the composer and its words.
 *
 * No database. The composer is a pure function over a fixture, exactly like
 * Part 1's selection engine, so every claim below is about real code and not
 * about a mock.
 *
 * Five fixtures, one per real week shape the brief names: a rich week, a
 * week she ignored, a mixed week, a conflicting-state week that must produce
 * exactly one question, and a thin-data member. Each one asserts what the
 * composer WROTE, not merely that it wrote something.
 *
 * One guard here was proven non-vacuous by breaking the code. See the note
 * on `a tier 1 direction never borrows tier 3 wording`.
 */

import { describe, it, expect } from 'vitest';
import {
  MIN_HISTORY_DAYS_FOR_FULL_REVIEW,
  MIN_RESETS_FOR_FULL_REVIEW,
  buildQuestionKeys,
  composeWeeklyReview,
  historyDaysFor,
  type ReviewDecision,
  type WeeklyReviewInputs,
} from '@/lib/weekly-review/compose';
import {
  renderObservation,
  renderReview,
  THIN_ADJUSTING,
  WEEKLY_REVIEW_HEADING_THIN,
} from '@/lib/weekly-review/copy';
import { MAX_OBSERVATIONS, MAX_QUESTIONS, MIN_FULL_OBSERVATIONS } from '@/lib/weekly-review/plan';
import { QUESTIONS } from '@/lib/weekly-review/questions';
import { addCalendarDays, reviewedRangeFor, weekStartFor } from '@/lib/weekly-review/week';
import type { LongitudinalSignal } from '@/lib/longitudinal-intelligence/types';
import { TIER_3_MARKERS, TIER_1_MARKERS } from './helpers/weeklyReviewFixtures';
import {
  WEEK_START,
  conflictingWeek,
  emptyInputs,
  ignoredWeek,
  mixedWeek,
  richWeek,
  thinMember,
} from './helpers/weeklyReviewFixtures';

const RANGE = reviewedRangeFor(WEEK_START);

describe('the week the review is about', () => {
  it("is the seven days BEFORE her local Monday, not the days of the new week", () => {
    // 2026-08-10 is a Monday. The review composed on it looks back at
    // 2026-08-03 through 2026-08-09.
    expect(WEEK_START).toBe('2026-08-10');
    expect(weekStartFor('2026-08-12')).toBe('2026-08-10');
    expect(RANGE).toEqual({ from: '2026-08-03', to: '2026-08-09' });
  });

  it('puts every day of a week into that week, and the next Monday into the next', () => {
    for (let offset = 0; offset < 7; offset += 1) {
      expect(weekStartFor(addCalendarDays('2026-08-10', offset))).toBe('2026-08-10');
    }
    expect(weekStartFor('2026-08-17')).toBe('2026-08-17');
  });
});

describe('the thin-data line', () => {
  it('is thin below five Daily Resets, however long the history', () => {
    const inputs = thinMember({ resets: MIN_RESETS_FOR_FULL_REVIEW - 1, spanDays: 200 });
    expect(composeWeeklyReview(inputs).shape).toBe('thin');
  });

  it('is thin below fourteen days of history, however many Resets', () => {
    const inputs = thinMember({ resets: 20, spanDays: MIN_HISTORY_DAYS_FOR_FULL_REVIEW - 1 });
    expect(composeWeeklyReview(inputs).shape).toBe('thin');
  });

  it('measures history from her first Daily Reset, never from an empty account', () => {
    expect(historyDaysFor([], WEEK_START)).toBe(0);
    // First reset on 2026-07-01, reviewed week ends 2026-08-09.
    expect(historyDaysFor(['2026-07-01'], WEEK_START)).toBe(40);
  });

  it('is full once both thresholds are met', () => {
    expect(composeWeeklyReview(richWeek()).shape).toBe('full');
  });
});

describe('the thin review', () => {
  const plan = composeWeeklyReview(thinMember({ resets: 4, spanDays: 9 }));
  const rendered = renderReview(plan, WEEK_START, {}, false);

  it('says what Root has, in exactly one sentence, and asks nothing', () => {
    expect(rendered.heading).toBe(WEEKLY_REVIEW_HEADING_THIN);
    expect(rendered.showed).toHaveLength(1);
    expect(rendered.showed[0]).toContain('4 Daily Resets');
    expect(rendered.questions).toEqual([]);
    expect(plan.questionKeys).toEqual([]);
  });

  it('claims nothing worked, because it has not measured whether anything did', () => {
    expect(rendered.worked).toEqual([]);
  });

  it('offers the single most useful thing, and never a count of what she missed', () => {
    expect(rendered.adjusting).toBe(THIN_ADJUSTING);
    expect(rendered.adjusting).toContain('one Daily Reset');
  });

  /**
   * FOUND BY A REAL SEEDED MEMBER, not by reading the code. A local fixture
   * had two Daily Resets eleven years apart, and the thin sentence read
   * "2 Daily Resets from you across 4058 days", which turns a statement of
   * what Root has into an unflattering ratio. The span is now mentioned only
   * when the SPAN is what made the review thin.
   */
  it('names the span only when the span is what made it thin', () => {
    // Thin on span: the span is relevant and is named.
    const shortSpan = renderReview(
      composeWeeklyReview(thinMember({ resets: 4, spanDays: 9 })),
      WEEK_START,
      {},
      false
    );
    expect(shortSpan.showed[0]).toContain('across 9 days');

    // Thin on COUNT with a long span: the span is not named at all.
    const longSpan = renderReview(
      composeWeeklyReview(thinMember({ resets: 2, spanDays: 4058 })),
      WEEK_START,
      {},
      false
    );
    expect(longSpan.showed[0]).toContain('2 Daily Resets');
    expect(longSpan.showed[0]).not.toContain('4058');
    expect(longSpan.showed[0]).not.toContain('across');
  });

  it('manufactures no observation for a member with nothing at all', () => {
    const rendered = renderReview(composeWeeklyReview(emptyInputs()), WEEK_START, {}, false);
    expect(rendered.showed).toHaveLength(1);
    expect(rendered.showed[0]).toContain('does not have a Daily Reset from you yet');
    expect(rendered.worked).toEqual([]);
    expect(rendered.questions).toEqual([]);
  });
});

describe('a rich week', () => {
  const plan = composeWeeklyReview(richWeek());
  const rendered = renderReview(plan, WEEK_START, {}, false);

  it('is full, and stays inside the two-to-four observation rule', () => {
    expect(plan.shape).toBe('full');
    expect(plan.observations.length).toBeGreaterThanOrEqual(MIN_FULL_OBSERVATIONS);
    expect(plan.observations.length).toBeLessThanOrEqual(MAX_OBSERVATIONS);
    expect(rendered.showed.length).toBe(plan.observations.length);
  });

  it('leads with the plan week and her metric direction, both in their own systems words', () => {
    // The Reset Plan's own weekly sentence, called rather than rewritten.
    expect(rendered.showed.join(' ')).toContain('this week on Sleep');
    // The three-tier language module's own tier 3 wording, for the tier 3 signal.
    expect(rendered.showed.some((line) => line.startsWith('Energy:'))).toBe(true);
  });

  it('names what worked from the ledger and the plan, and nothing it did not measure', () => {
    expect(rendered.worked.length).toBeGreaterThan(0);
    expect(rendered.worked.join(' ')).toContain('took Root up on');
    expect(rendered.worked.join(' ')).toContain('Reset Plan action');
  });

  it('adjusts toward what landed, and says why in one sentence', () => {
    expect(plan.focus.reason).toBe('engagement_strong');
    expect(rendered.adjusting).toContain('worth continuing rather than replacing');
    expect(rendered.adjusting.split('. ').length).toBeLessThanOrEqual(2);
  });

  it('asks nothing, because nothing about it was ambiguous', () => {
    expect(plan.questionKeys).toEqual([]);
  });
});

describe('a week she ignored', () => {
  const plan = composeWeeklyReview(ignoredWeek());
  const rendered = renderReview(plan, WEEK_START, {}, false);

  it('puts the failure on the suggestion, never on her', () => {
    const engagement = rendered.showed.find((line) => line.includes('no record'));
    expect(engagement).toBeDefined();
    expect(engagement).toContain('information about the suggestions');
  });

  it('makes next week smaller rather than better, and says so', () => {
    expect(plan.focus.reason).toBe('engagement_thin');
    expect(plan.focus.actionType).toBe('reset');
    expect(rendered.adjusting).toContain('smaller ask');
  });

  it('still credits what she genuinely did, and claims nothing she did not', () => {
    // She showed up seven times. That belongs in "what worked" whatever
    // happened to Root's suggestions, and leaving it out to make the week
    // look uniformly flat would be its own dishonesty. What must NOT appear
    // is a claim she acted on a suggestion, or that she returned to the plan
    // action, because the ledger and the plan logs record neither.
    expect(rendered.worked).toEqual(['You logged 7 Daily Resets.']);
    expect(rendered.worked.join(' ')).not.toContain('took Root up on');
    expect(rendered.worked.join(' ')).not.toContain('Reset Plan action');
  });

  it('never states a count of what she did not do', () => {
    const all = [...rendered.showed, rendered.adjusting].join(' ');
    expect(all).not.toMatch(/missed/i);
    expect(all).not.toMatch(/you ignored/i);
    expect(all).not.toMatch(/\bstreak\b/i);
    expect(all).not.toMatch(/you should/i);
  });
});

describe('a mixed week', () => {
  const inputs = mixedWeek();
  const plan = composeWeeklyReview(inputs);
  const rendered = renderReview(plan, WEEK_START, {}, false);

  it('reports both halves: what landed, and what Root offered', () => {
    expect(rendered.worked.join(' ')).toContain('took Root up on 2 suggestions');
    expect(rendered.showed.join(' ')).toContain('you picked up 2');
  });

  it('asks the one question a mixed RESPONSE earns, and only that one', () => {
    expect(plan.questionKeys).toEqual(['mixed_response']);
    expect(rendered.questions).toHaveLength(1);
    expect(rendered.questions[0]!.prompt).toBe(QUESTIONS.mixed_response.prompt);
  });

  it('earns that question from the SAME thread landing and not landing, not merely from a mix', () => {
    // Prove non-vacuity: the same week with the acted and ignored rows on
    // DIFFERENT threads is not ambiguous and earns no question.
    const separateThreads: ReviewDecision[] = inputs.decisions.map((decision, index) => ({
      ...decision,
      threadKey: `qualified_pattern::pair-${index}`,
    }));
    expect(buildQuestionKeys({ ...inputs, decisions: separateThreads })).toEqual([]);
  });
});

describe('a conflicting-state week', () => {
  const plan = composeWeeklyReview(conflictingWeek());
  const rendered = renderReview(plan, WEEK_START, {}, false);

  it('produces exactly one question', () => {
    expect(plan.questionKeys).toEqual(['mixed_picture']);
    expect(rendered.questions).toHaveLength(1);
  });

  it('names the mixed picture in the language modules own fixed words', () => {
    const line = rendered.showed.find((sentence) => sentence.includes('mixed'));
    expect(line).toBeDefined();
    expect(line).toContain('different signals point in different directions');
  });

  it('never exceeds the two-question ceiling even when both conditions fire', () => {
    const both = conflictingWeek();
    const ambiguous = mixedWeek();
    const keys = buildQuestionKeys({ ...both, decisions: ambiguous.decisions });
    expect(keys).toEqual(['mixed_picture', 'mixed_response']);
    expect(keys.length).toBeLessThanOrEqual(MAX_QUESTIONS);
  });
});

describe('the three-tier language limit', () => {
  /**
   * The tier limit is enforced at TWO independent layers, and this test
   * covers the renderer's own layer directly rather than through the
   * composer, because the composer's selection filter would otherwise hide
   * it.
   *
   * PROVEN NON-VACUOUS BY BREAKING THE CODE. Removing the
   * `if (observation.tier === null) return null` guard from
   * renderMetricDirection made this test fail: the untiered signal came out
   * wearing the tier 1 opener, which is a claim the language module
   * explicitly declined to make. Guard restored and the suite re-verified.
   */
  it('the renderer itself refuses an untiered direction, whatever reaches it', () => {
    expect(
      renderObservation(
        {
          kind: 'metric_direction',
          tier: null,
          signalKey: 'checkin_metric::energy',
          state: 'worsening',
          metrics: { confidence: 0.9, occurrenceCount: 9 },
        },
        WEEK_START
      )
    ).toBeNull();

    // Non-vacuity for the guard itself: the same observation WITH a tier
    // renders, so the null return above is about the tier and nothing else.
    expect(
      renderObservation(
        {
          kind: 'metric_direction',
          tier: 2,
          signalKey: 'checkin_metric::energy',
          state: 'worsening',
          metrics: { confidence: 0.9, occurrenceCount: 9 },
        },
        WEEK_START
      )
    ).toContain('Energy:');
  });

  /**
   * The composer's own, SECOND layer: an untiered signal is filtered out at
   * SELECTION, so it never even becomes a candidate observation and cannot
   * be stored in the plan at all.
   *
   * This is deliberately redundant with the renderer's guard above. The two
   * were checked independently by breaking each one alone: removing the
   * renderer's guard failed the test above; removing this filter did NOT
   * fail anything, because the renderer's guard caught it. That is defence in
   * depth working as intended, and it is worth recording accurately rather
   * than claiming both were proven the same way.
   *
   * So this test asserts the thing only THIS layer can be responsible for:
   * that the untiered signal is absent from the stored PLAN, not merely
   * absent from the rendered words.
   */
  it('never stores an untiered direction in the plan at all', () => {
    const untiered: LongitudinalSignal = {
      signalKey: 'checkin_metric::energy',
      signalKind: 'checkin_metric',
      signalLabel: 'energy',
      state: 'worsening',
      tier: null,
      occurrenceCount: 9,
      confidence: 0.9,
      firstObservedAt: '2026-07-01',
      lastObservedAt: '2026-08-09',
      evidenceSummary: {},
    };
    const plan = composeWeeklyReview({ ...richWeek(), patternStates: [untiered] });
    expect(plan.observations.some((item) => item.kind === 'metric_direction')).toBe(false);

    // Non-vacuity: the identical signal WITH a tier is stored and rendered.
    const tiered = composeWeeklyReview({
      ...richWeek(),
      patternStates: [{ ...untiered, tier: 2 }],
    });
    expect(tiered.observations.some((item) => item.kind === 'metric_direction')).toBe(true);

    const rendered = renderReview(plan, WEEK_START, {}, false);
    expect(rendered.showed.some((line) => line.startsWith('Energy:'))).toBe(false);
  });

  it('a tier 1 direction never borrows tier 3 wording', () => {
    const tierOne: LongitudinalSignal = {
      signalKey: 'checkin_metric::sleep',
      signalKind: 'checkin_metric',
      signalLabel: 'sleep',
      state: 'worsening',
      tier: 1,
      occurrenceCount: 1,
      confidence: 0.4,
      firstObservedAt: '2026-08-03',
      lastObservedAt: '2026-08-09',
      evidenceSummary: {},
    };
    const rendered = renderReview(
      composeWeeklyReview({ ...richWeek(), patternStates: [tierOne] }),
      WEEK_START,
      {},
      false
    );
    const line = rendered.showed.find((sentence) => sentence.startsWith('Sleep:'));
    expect(line).toBeDefined();
    expect(TIER_1_MARKERS.some((marker) => line!.includes(marker))).toBe(true);
    expect(TIER_3_MARKERS.some((marker) => line!.includes(marker))).toBe(false);
  });

  it('a tier 3 direction is allowed the confident wording it earned', () => {
    const rendered = renderReview(composeWeeklyReview(richWeek()), WEEK_START, {}, false);
    const line = rendered.showed.find((sentence) => sentence.startsWith('Energy:'));
    expect(line).toBeDefined();
    expect(TIER_3_MARKERS.some((marker) => line!.includes(marker))).toBe(true);
  });

  it('never promotes a tier 1 signal into the focus, which needs tier 2 or above', () => {
    const tierOne: LongitudinalSignal = {
      signalKey: 'checkin_metric::digestion',
      signalKind: 'checkin_metric',
      signalLabel: 'digestion',
      state: 'worsening',
      tier: 1,
      occurrenceCount: 1,
      confidence: 0.9,
      firstObservedAt: '2026-08-03',
      lastObservedAt: '2026-08-09',
      evidenceSummary: {},
    };
    const plan = composeWeeklyReview({
      ...richWeek(),
      patternStates: [tierOne],
      friction: null,
    });
    expect(plan.focus.reason).not.toBe('direction_worsening');
  });

  it('follows a tier 2 worsening direction into the focus', () => {
    const tierTwo: LongitudinalSignal = {
      signalKey: 'checkin_metric::digestion',
      signalKind: 'checkin_metric',
      signalLabel: 'digestion',
      state: 'worsening',
      tier: 2,
      occurrenceCount: 2,
      confidence: 0.7,
      firstObservedAt: '2026-07-20',
      lastObservedAt: '2026-08-09',
      evidenceSummary: {},
    };
    const plan = composeWeeklyReview({
      ...richWeek(),
      patternStates: [tierTwo],
      friction: null,
    });
    expect(plan.focus.reason).toBe('direction_worsening');
    expect(plan.focus.actionType).toBe('nutrition');
  });
});

describe('determinism', () => {
  it('composes the identical plan from the identical inputs', () => {
    expect(composeWeeklyReview(richWeek())).toEqual(composeWeeklyReview(richWeek()));
  });

  it('renders the identical words from the identical plan', () => {
    const plan = composeWeeklyReview(mixedWeek());
    expect(renderReview(plan, WEEK_START, {}, false)).toEqual(
      renderReview(plan, WEEK_START, {}, false)
    );
  });
});

describe('the copy rules, over every fixture', () => {
  const fixtures: Record<string, WeeklyReviewInputs> = {
    rich: richWeek(),
    ignored: ignoredWeek(),
    mixed: mixedWeek(),
    conflicting: conflictingWeek(),
    thin: thinMember({ resets: 3, spanDays: 8 }),
    empty: emptyInputs(),
  };

  for (const [name, inputs] of Object.entries(fixtures)) {
    const plan = composeWeeklyReview(inputs);
    const rendered = renderReview(plan, WEEK_START, {}, false);
    const everything = [
      rendered.heading,
      rendered.showedTitle,
      ...rendered.showed,
      rendered.workedTitle,
      ...rendered.worked,
      rendered.adjustingTitle,
      rendered.adjusting,
      ...rendered.questions.flatMap((question) => [
        question.prompt,
        ...question.options.map((option) => option.label),
      ]),
      rendered.acknowledgeLabel,
    ].join(' ');

    it(`${name}: contains no em dash`, () => {
      expect(everything).not.toContain('—');
    });

    it(`${name}: never scolds and never counts a miss`, () => {
      expect(everything).not.toMatch(/missed/i);
      expect(everything).not.toMatch(/\bstreak\b/i);
      expect(everything).not.toMatch(/you should/i);
      expect(everything).not.toMatch(/failed/i);
      expect(everything).not.toMatch(/only \d+ (of|day)/i);
    });

    it(`${name}: always says what Root is adjusting`, () => {
      expect(rendered.adjusting.length).toBeGreaterThan(0);
    });

    it(`${name}: renders no blank observation`, () => {
      for (const sentence of rendered.showed) expect(sentence.trim().length).toBeGreaterThan(0);
      for (const sentence of rendered.worked) expect(sentence.trim().length).toBeGreaterThan(0);
    });
  }
});
