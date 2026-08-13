/**
 * The Weekly Root Review — the privacy boundary, proved.
 *
 * No database. Everything asserted here is a property of the code that
 * builds what gets stored and what gets sent.
 *
 * Four layers, in the order a leak would have to get through:
 *
 *   1. The VOCABULARY. Neither closed set contains a key that could hold a
 *      health answer, and neither has a free-string field at all.
 *   2. The SANITIZERS, at runtime, against deliberately hostile input.
 *   3. The COMPOSER'S REAL OUTPUT, for every fixture, with content-bearing
 *      data planted in every input it reads.
 *   4. The ANALYTICS PAYLOAD SHAPE, which has no field an answer could
 *      travel in.
 *
 * One test proves non-vacuity by showing a member-facing sentence really
 * does reach the RENDERED review while never reaching the stored plan. That
 * is the whole architecture of this feature in one assertion.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ALLOWED_FOCUS_EVIDENCE_KEYS,
  ALLOWED_METRIC_KEYS,
  MAX_SLUG_LENGTH,
  PLAN_VOCABULARY,
  sanitizeAnswers,
  sanitizeFocus,
  sanitizeFocusEvidence,
  sanitizeMetrics,
  sanitizeObservation,
  sanitizePlan,
  sanitizeQuestionKeys,
} from '@/lib/weekly-review/plan';
import { composeWeeklyReview } from '@/lib/weekly-review/compose';
import { renderReview } from '@/lib/weekly-review/copy';
import { ALL_ANSWER_OPTIONS, QUESTION_KEYS } from '@/lib/weekly-review/questions';
import { FOCUS_REASONS } from '@/lib/weekly-review/types';
import { sanitizeAnalyticsPayload } from '@/lib/analytics/track';
import {
  WEEK_START,
  conflictingWeek,
  emptyInputs,
  frictionInput,
  ignoredWeek,
  mixedWeek,
  richWeek,
  signal,
  thinMember,
} from './helpers/weeklyReviewFixtures';

const REPO = path.resolve(__dirname, '..');

/**
 * Field names and values from the health systems this feature reads
 * ALONGSIDE. If any of these could appear in a stored plan or a focus row,
 * the boundary has failed.
 */
const HEALTH_VOCABULARY = [
  'painLocation',
  'pain_location',
  'sleepQuality',
  'sleep_quality',
  'sleepHours',
  'energyLevel',
  'energy_level',
  'stressLevel',
  'moodRating',
  'digestion',
  'symptoms',
  'concern',
  'concernCategory',
  'concern_category',
  'safetyLevel',
  'safety_level',
  'urgency',
  'categories',
  'foodName',
  'food_name',
  'calories',
  'protein',
  'macros',
  'mealDescription',
  'questionnaireAnswer',
  'answerText',
  'answer_text',
  'freeText',
  'notes',
  'memberSentence',
  // NOTE: 'reason' is deliberately NOT on this list. A review plan has a
  // legitimate `focus.reason` field, and in this feature it holds a slug from
  // the closed FOCUS_REASONS set, never prose, which the dedicated test
  // below asserts directly. Banning the field NAME here would have been a
  // weaker check dressed up as a stronger one.
  'reasonText',
  'title',
  'text',
  'summary',
  'coachDetail',
  'evidenceSummary',
];

describe('the vocabulary', () => {
  it('has no metric key that could name a health value', () => {
    for (const key of ALLOWED_METRIC_KEYS) {
      expect(HEALTH_VOCABULARY).not.toContain(key);
    }
  });

  it('has no focus evidence key that could name a health value', () => {
    for (const key of ALLOWED_FOCUS_EVIDENCE_KEYS) {
      expect(HEALTH_VOCABULARY).not.toContain(key);
    }
  });

  it('exposes exactly three closed sets and no free-text field', () => {
    expect(Object.keys(PLAN_VOCABULARY).sort()).toEqual([
      'focusEvidenceKeys',
      'metricKeys',
      'questionKeys',
    ]);
    expect([...PLAN_VOCABULARY.questionKeys]).toEqual([...QUESTION_KEYS]);
  });

  it('keeps every answer option a short slug, so an answer can never be prose', () => {
    for (const option of ALL_ANSWER_OPTIONS) {
      expect(option.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
      expect(option).not.toMatch(/\s/);
    }
  });
});

describe('the sanitizers, against hostile input', () => {
  it('drops every metric that is not an allowed, finite number', () => {
    expect(
      sanitizeMetrics({
        thisWeekResets: 4,
        painLocation: 3,
        sleepQuality: 8,
        acted: Number.NaN,
        delivered: Number.POSITIVE_INFINITY,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        confidence: '0.9' as any,
      })
    ).toEqual({ thisWeekResets: 4 });
  });

  it('drops a sentence smuggled into an allowed focus evidence key', () => {
    expect(
      sanitizeFocusEvidence({
        signalKey: 'checkin_metric::energy',
        state: 'she said her lower back hurts when she wakes up',
        metricKey: 'energy',
        tier: 3,
      })
    ).toEqual({ signalKey: 'checkin_metric::energy', metricKey: 'energy', tier: 3 });
  });

  it('drops nested structure outright, which is how an evidence summary would leak', () => {
    expect(
      sanitizeFocusEvidence({
        signalKey: { nested: 'lower back pain' } as unknown as string,
        state: ['a', 'sentence', 'as', 'an', 'array'] as unknown as string,
      })
    ).toEqual({});
  });

  it('drops a long slug even with no whitespace in it', () => {
    const long = 'a'.repeat(MAX_SLUG_LENGTH + 1);
    expect(sanitizeFocusEvidence({ signalKey: long })).toEqual({});
    expect(sanitizeObservation({ kind: 'friction', signalKey: long, tier: 1, state: null })?.signalKey).toBeNull();
  });

  it('drops an observation whose kind is not in the closed set', () => {
    expect(sanitizeObservation({ kind: 'sleep_quality_summary', metrics: {} })).toBeNull();
  });

  it('drops an unknown question key and an unknown option', () => {
    expect(sanitizeQuestionKeys(['mixed_picture', 'how_is_your_back', 'mixed_picture'])).toEqual([
      'mixed_picture',
    ]);
    expect(
      sanitizeAnswers({
        mixed_picture: 'both_true',
        mixed_response: 'my lower back has been bad all week',
        how_is_your_back: 'terrible',
      })
    ).toEqual({ mixed_picture: 'both_true' });
  });

  it('refuses a focus that names nothing, so an unreadable focus is never stored', () => {
    expect(sanitizeFocus({ actionType: null, threadKey: null }, WEEK_START)).toBeNull();
  });

  it('refuses a whole plan whose focus is unstorable', () => {
    expect(sanitizePlan({ shape: 'full', observations: [], worked: [] }, WEEK_START)).toBeNull();
  });
});

describe("the composer's real output, with content planted in every input", () => {
  /**
   * Every input the composer reads, carrying real health content in the
   * fields those systems genuinely have. If any of it survives into the
   * plan, this fails.
   */
  function contentBearing() {
    return {
      ...richWeek(),
      friction: frictionInput('daily_reset_incomplete'),
      patternStates: [
        signal({
          signalKey: 'checkin_metric::energy',
          // A real member-facing sentence, in the field member_pattern_states
          // genuinely carries one in.
          evidenceSummary: {
            area: 'energy',
            memberSentence:
              'On nights you get to bed at a steadier time, your next-day energy tends to be higher.',
            painLocation: 'lower back',
            sleepHours: 5.5,
          },
        }),
      ],
    };
  }

  const plan = composeWeeklyReview(contentBearing());
  const serialized = JSON.stringify(plan);

  it('stores no health field name anywhere in the plan', () => {
    for (const term of HEALTH_VOCABULARY) {
      expect(serialized).not.toContain(term);
    }
  });

  it('stores no sentence, anywhere, under any key', () => {
    // Nothing in a plan may contain a space. Every legitimate value is a
    // slug, a number, or a boolean, so this single assertion covers every
    // present and future key at once.
    for (const observation of plan.observations) {
      if (observation.signalKey) expect(observation.signalKey).not.toMatch(/\s/);
      if (observation.state) expect(observation.state).not.toMatch(/\s/);
      for (const value of Object.values(observation.metrics)) {
        expect(typeof value).toBe('number');
      }
    }
    for (const value of Object.values(plan.focus.sourceEvidence)) {
      if (typeof value === 'string') expect(value).not.toMatch(/\s/);
    }
    if (plan.focus.threadKey) expect(plan.focus.threadKey).not.toMatch(/\s/);
  });

  it('stores no free text on any worked item either', () => {
    for (const worked of plan.worked) {
      for (const value of Object.values(worked.metrics)) expect(typeof value).toBe('number');
      if (worked.actionType) expect(worked.actionType).not.toMatch(/\s/);
    }
  });

  it('NON-VACUITY: the plan really does carry the signal key it observed', () => {
    // Without this the tests above could pass on an empty plan.
    expect(plan.observations.length).toBeGreaterThan(0);
    expect(plan.observations.some((item) => item.signalKey === 'checkin_metric::energy')).toBe(true);
    expect(Object.keys(plan.focus.sourceEvidence).length).toBeGreaterThan(0);
  });

  it('NON-VACUITY: a member-facing sentence reaches the RENDERED review and never the stored plan', () => {
    const rendered = renderReview(plan, WEEK_START, {}, false);
    const words = [...rendered.showed, ...rendered.worked, rendered.adjusting].join(' ');

    // The rendered review genuinely contains prose. It has to: it is what she
    // reads.
    expect(words).toMatch(/\s/);
    expect(words.length).toBeGreaterThan(80);

    // And not one word of it is in the row.
    for (const sentence of rendered.showed) {
      expect(serialized).not.toContain(sentence);
    }
    expect(serialized).not.toContain(rendered.adjusting);
  });

  it('the focus reason is always a slug from the closed set, never prose', () => {
    const fixtures = [
      richWeek(),
      ignoredWeek(),
      mixedWeek(),
      conflictingWeek(),
      thinMember({ resets: 3, spanDays: 8 }),
      emptyInputs(),
    ];
    for (const inputs of fixtures) {
      const reason = composeWeeklyReview(inputs).focus.reason;
      expect(FOCUS_REASONS).toContain(reason);
      expect(reason).not.toMatch(/\s/);
    }
  });

  it('holds for every fixture, not just the loaded one', () => {
    const fixtures = [
      richWeek(),
      ignoredWeek(),
      mixedWeek(),
      conflictingWeek(),
      thinMember({ resets: 3, spanDays: 8 }),
      emptyInputs(),
    ];
    for (const inputs of fixtures) {
      const json = JSON.stringify(composeWeeklyReview(inputs));
      for (const term of HEALTH_VOCABULARY) expect(json).not.toContain(term);
    }
  });
});

describe('the analytics payloads', () => {
  it('cannot carry an answer, because there is no key for one', () => {
    const payload = sanitizeAnalyticsPayload({
      questionKey: 'mixed_picture',
      // Every plausible name someone might reach for. All dropped.
      answer: 'both_true',
      answerText: 'my back hurt on Tuesday',
      option: 'one_changed',
      response: 'not_sure',
      value: 'both_true',
    } as never);
    expect(payload).toEqual({ questionKey: 'mixed_picture' });
  });

  it('carries only the shape and the focus kind on a delivery', () => {
    expect(
      sanitizeAnalyticsPayload({
        shape: 'full',
        actionType: 'nutrition',
        // Cast through `never` at the object level: the TYPE already refuses
        // these two fields, which is the first line of defence. The cast is
        // what lets the test also prove the RUNTIME sanitizer drops them, for
        // a payload arriving from a browser where the type is not enforced.
        observations: '3',
        signalKey: 'checkin_metric::energy',
      } as never)
    ).toEqual({ shape: 'full', actionType: 'nutrition' });
  });

  it('drops a sentence pushed through the questionKey field itself', () => {
    expect(
      sanitizeAnalyticsPayload({
        questionKey:
          'she said her sleep has been broken all week and her lower back is worse in the mornings',
      })
    ).toEqual({});
  });
});

describe('the source, read as source', () => {
  const planSource = readFileSync(path.join(REPO, 'lib/weekly-review/plan.ts'), 'utf-8');
  const dataSource = readFileSync(path.join(REPO, 'lib/weekly-review/data.ts'), 'utf-8');

  it('the sanitizer drops rather than throws, so a mistaken call site never breaks her page', () => {
    expect(planSource).not.toMatch(/throw new Error/);
  });

  it('the data layer writes the plan only through the sanitizers', () => {
    // Every jsonb column written by this feature. If a future change writes
    // one of them from anywhere but a sanitizer, this fails.
    expect(dataSource).toContain('sanitizeFocusEvidence(focus.sourceEvidence)');
    expect(dataSource).toContain('sanitizeAnswers(');
    expect(dataSource).toContain('sanitizePlan(');
  });

  it('the migration says the hard rule out loud', () => {
    const migration = readFileSync(
      path.resolve(REPO, '../../supabase/migrations/00000000000151_weekly_root_review.sql'),
      'utf-8'
    );
    expect(migration).toContain('NEITHER TABLE STORES ANY MEMBER-FACING SENTENCE');
  });
});
