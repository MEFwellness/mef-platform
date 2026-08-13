/**
 * Adaptive Coaching Direction Part 3 — the privacy boundary.
 *
 * Same three-layer discipline as tests/coaching-direction-privacy.test.ts
 * and tests/weekly-review-privacy.test.ts:
 *
 *   1. The VOCABULARIES, checked against the field names the health systems
 *      in this app actually use. A key that could hold a check-in answer
 *      must not be on any of the three lists this build owns.
 *   2. The SANITIZERS, against hostile input.
 *   3. The REAL OUTPUT of every new surface, computed over fixtures with a
 *      member-facing sentence, a pain location, a sleep number and a food
 *      name deliberately planted in the inputs they read.
 *
 * The third layer is the one that matters, and one test in it proves
 * non-vacuity by showing planted content really does exist in the input and
 * really does not reach the output.
 */

import { describe, it, expect } from 'vitest';
import { gradeDecisions } from '@/lib/coaching-direction/grading';
import type { GradeableDecision } from '@/lib/coaching-direction/grading';
import { countValue } from '@/lib/coaching-direction/gradesService';
import { buildEscalationView, collectSignalKeys } from '@/lib/coaching-direction/escalation';
import type { EscalatedThreadDecision } from '@/lib/coaching-direction/escalation';
import { sanitizeSignalEvidence } from '@/lib/coaching-direction/evidence';
import { sanitizeAnalyticsPayload } from '@/lib/analytics/track';
import { GRADE_VOCABULARY, sanitizeGrade, sanitizeGrades } from '@/lib/weekly-review/plan';
import { renderGradeAdjusting, renderGradeWorked } from '@/lib/weekly-review/copy';
import type { ReviewGrade } from '@/lib/weekly-review/types';

/**
 * Real health content, in the exact shapes this app stores it in. Planted
 * into every fixture below.
 */
const PLANTED = {
  sentence:
    'On nights you get to bed at a steadier time, your next-day energy tends to be higher.',
  painLocation: 'lower_back',
  sleepHours: 5.5,
  foodName: 'chicken and rice bowl',
  concern: 'chest tightness when climbing stairs',
  questionnaireAnswer: 'I have been feeling low most mornings',
};

/**
 * Field names the health systems in this app genuinely use. None of them
 * may appear in any vocabulary this build owns.
 */
const HEALTH_FIELD_NAMES = [
  'pain_level',
  'painLevel',
  'pain_location',
  'painLocation',
  'sleep_hours',
  'sleepHours',
  'sleep_quality',
  'sleepQuality',
  'mood_level',
  'moodLevel',
  'stress_level',
  'stressLevel',
  'energy_level',
  'energyLevel',
  'digestion_level',
  'hydration_ml',
  'water_intake',
  'new_or_worsening_concern',
  'concern',
  'concernText',
  'symptoms_or_changes',
  'notes',
  'note',
  'answer',
  'answers',
  'response_text',
  'freeText',
  'text',
  'memberSentence',
  'coachSentence',
  'food_name',
  'foodName',
  'protein_grams',
  'calories',
  'classification_level',
  'urgency',
  'categories',
  'safety_level',
];

// =====================================================================
// Layer 1 — the vocabularies.
// =====================================================================

describe('the grade vocabulary cannot name a health value', () => {
  it('has no field that could hold a health answer', () => {
    for (const field of GRADE_VOCABULARY.fields) {
      expect(HEALTH_FIELD_NAMES).not.toContain(field);
    }
  });

  it('has no metric key that could hold a health value', () => {
    for (const key of GRADE_VOCABULARY.metricKeys) {
      expect(HEALTH_FIELD_NAMES).not.toContain(key);
    }
  });

  /**
   * The two metric keys Part 3 adds. Both are properties of what ROOT did
   * and of the ledger, never of her body: `moved` counts completed
   * before/after comparisons that reported movement, and
   * `daysSinceLastDelivered` is a gap between two delivery dates.
   */
  it("the keys Part 3 adds are about Root's own record, not about her", () => {
    expect(GRADE_VOCABULARY.metricKeys as readonly string[]).toContain('moved');
    expect(GRADE_VOCABULARY.metricKeys as readonly string[]).toContain('daysSinceLastDelivered');
  });

  it('has exactly four fields, so a fifth cannot be added without this test noticing', () => {
    expect([...GRADE_VOCABULARY.fields].sort()).toEqual([
      'actionType',
      'evidence',
      'metrics',
      'verdict',
    ]);
  });
});

// =====================================================================
// Layer 2 — the sanitizers, against hostile input.
// =====================================================================

describe('the grade sanitizer drops everything it does not recognise', () => {
  const hostile = {
    actionType: 'reset',
    verdict: 'landing',
    evidence: 'strong',
    metrics: {
      acted: 4,
      moved: 2,
      painLevel: 7,
      sleepHours: PLANTED.sleepHours,
      note: PLANTED.concern,
    },
    memberSentence: PLANTED.sentence,
    concern: PLANTED.concern,
    answers: { mood: PLANTED.questionnaireAnswer },
  };

  it('keeps only the four declared fields', () => {
    const clean = sanitizeGrade(hostile)!;
    expect(Object.keys(clean).sort()).toEqual(['actionType', 'evidence', 'metrics', 'verdict']);
  });

  it('keeps only allowlisted metrics, dropping the health ones planted beside them', () => {
    const clean = sanitizeGrade(hostile)!;
    expect(clean.metrics).toEqual({ acted: 4, moved: 2 });
  });

  it('drops rather than throws, so a mistaken call site never breaks a render', () => {
    expect(() => sanitizeGrades([hostile, null, 'a sentence', 42, undefined])).not.toThrow();
    expect(sanitizeGrades([hostile, null, 'a sentence', 42])).toHaveLength(1);
  });

  it('refuses an unrecognised verdict rather than coercing it to a known one', () => {
    expect(sanitizeGrade({ ...hostile, verdict: 'excellent' })).toBeNull();
  });

  it('serialises to JSON containing none of the planted content', () => {
    const json = JSON.stringify(sanitizeGrades([hostile]));
    for (const value of Object.values(PLANTED)) {
      expect(json).not.toContain(String(value));
    }
  });
});

describe('the ledger evidence sanitizer still refuses everything Part 3 might newly pass it', () => {
  it('drops a comparison outcome dressed up as a sentence', () => {
    const clean = sanitizeSignalEvidence({
      frictionKind: 'daily_reset_incomplete',
      memberSentence: PLANTED.sentence,
      painLocation: PLANTED.painLocation,
      foodName: PLANTED.foodName,
    });
    expect(clean).toEqual({ frictionKind: 'daily_reset_incomplete' });
  });
});

// =====================================================================
// Layer 3 — the real output of every new surface.
// =====================================================================

describe('a computed grade carries nothing but counts, slugs and dates', () => {
  /**
   * The ledger rows a grade is computed from carry a real evidence object.
   * A grade must not carry it forward in any form.
   */
  const decisions: GradeableDecision[] = Array.from({ length: 6 }, (_, index) => ({
    localDate: `2026-08-0${index + 1}`,
    actionType: 'reset',
    threadKey: 'behavioral_friction::daily_reset_incomplete',
    memberResponse: 'done',
    comparisonOutcome: 'moved',
  }));

  const grade = gradeDecisions('action_type', 'reset', 'reset', decisions);

  it('has exactly the declared shape and nothing else', () => {
    expect(Object.keys(grade).sort()).toEqual(
      [
        'actedCount',
        'actionType',
        'comparedCount',
        'deliveredCount',
        'evidenceLevel',
        'ignoredCount',
        'key',
        'lastDeliveredLocalDate',
        'movedCount',
        'notSeenCount',
        'scope',
        'spanDays',
        'verdict',
      ].sort()
    );
  });

  it('every value is a number, a date, or a slug from a closed set', () => {
    for (const [key, value] of Object.entries(grade)) {
      if (typeof value === 'number' || value === null) continue;
      expect(typeof value).toBe('string');
      // No whitespace means no sentence, the same rule the two other
      // sanitizers in this feature enforce.
      expect(String(value)).not.toMatch(/\s/);
      expect(key.length).toBeGreaterThan(0);
    }
  });
});

describe('the coach escalation surface shows behavioral facts, not health content', () => {
  /**
   * A deliberately hostile ledger: the evidence object carries a real
   * finding sentence, a pain location, a sleep number and a food name
   * alongside its legitimate keys. Note the shapes are exactly what an
   * upstream engine would produce.
   */
  const hostileDecisions: EscalatedThreadDecision[] = [
    {
      threadKey: 'implicated_driver::SLP-3',
      memberResponse: 'ignored',
      signalEvidence: {
        rule: 'implicated_driver',
        driverId: 'SLP-3',
        driverDomain: 'SLP',
        confidence: 0.82,
        // Planted. None of these is on ESCALATION_SIGNAL_KEYS.
        memberSentence: PLANTED.sentence,
        painLocation: PLANTED.painLocation,
        sleepHours: PLANTED.sleepHours,
        foodName: PLANTED.foodName,
        concern: PLANTED.concern,
      },
    },
    { threadKey: 'implicated_driver::SLP-3', memberResponse: 'ignored', signalEvidence: {} },
    { threadKey: 'implicated_driver::SLP-3', memberResponse: 'later', signalEvidence: {} },
  ];

  const view = buildEscalationView(
    {
      threadKey: 'implicated_driver::SLP-3',
      rule: 'implicated_driver',
      actionType: 'reflection',
      approachChanges: 2,
      coachEscalatedAt: '2026-08-10T14:03:00.000Z',
      escalationCount: 1,
      firstSelectedLocalDate: '2026-07-28',
      lastSelectedLocalDate: '2026-08-10',
    },
    hostileDecisions
  );

  it('surfaces the identifying keys it declares', () => {
    const keys = view.signalKeys.map((s) => s.key);
    expect(keys).toContain('driverId');
    expect(keys).toContain('driverDomain');
  });

  /**
   * NON-VACUITY. The planted content is genuinely present in the input this
   * builder reads, and genuinely absent from everything it produces. Both
   * halves are asserted, so this test cannot pass because the fixture was
   * empty.
   */
  it('the planted health content really is in the input', () => {
    const input = JSON.stringify(hostileDecisions);
    expect(input).toContain(PLANTED.sentence);
    expect(input).toContain(PLANTED.painLocation);
    expect(input).toContain(PLANTED.foodName);
    expect(input).toContain(String(PLANTED.sleepHours));
  });

  it('and none of it reaches the coach view, under any key', () => {
    const output = JSON.stringify(view);
    for (const value of Object.values(PLANTED)) {
      expect(output).not.toContain(String(value));
    }
  });

  it('no value on the view contains a sentence-shaped string from the evidence', () => {
    for (const signal of view.signalKeys) {
      expect(signal.value).not.toMatch(/\s/);
    }
  });

  it('the view never carries a free-text field of its own', () => {
    expect(Object.keys(view)).not.toContain('note');
    expect(Object.keys(view)).not.toContain('reason');
    expect(Object.keys(view)).not.toContain('summary');
  });

  it('collectSignalKeys ignores every key not on its declared list', () => {
    const keys = collectSignalKeys(hostileDecisions).map((s) => s.key);
    expect(keys).not.toContain('memberSentence');
    expect(keys).not.toContain('painLocation');
    expect(keys).not.toContain('sleepHours');
    expect(keys).not.toContain('foodName');
    expect(keys).not.toContain('concern');
    expect(keys).not.toContain('confidence');
  });
});

describe('the two member-facing grade sentences quote nothing', () => {
  const grades: ReviewGrade[] = [
    {
      actionType: 'reset',
      verdict: 'landing',
      evidence: 'strong',
      metrics: { delivered: 10, acted: 8, moved: 3, daysSinceLastDelivered: 1 },
    },
    {
      actionType: 'nutrition',
      verdict: 'dead',
      evidence: 'moderate',
      metrics: { delivered: 8, acted: 0, daysSinceLastDelivered: 2 },
    },
  ];

  it('renders no planted content, because the plan they render from cannot hold any', () => {
    const sentences = [
      ...grades.map(renderGradeWorked),
      ...grades.map(renderGradeAdjusting),
    ].filter((s): s is string => s !== null);

    expect(sentences.length).toBeGreaterThan(0);
    for (const sentence of sentences) {
      for (const value of Object.values(PLANTED)) {
        expect(sentence).not.toContain(String(value));
      }
    }
  });
});

// =====================================================================
// The analytics payloads.
// =====================================================================

describe('the three Part 3 analytics payloads carry counts and slugs only', () => {
  it('coaching_grades_computed carries three digit strings and nothing else', () => {
    const clean = sanitizeAnalyticsPayload({
      gradeCount: countValue(7),
      landingCount: countValue(2),
      deadCount: countValue(1),
    });
    expect(clean).toEqual({ gradeCount: '7', landingCount: '2', deadCount: '1' });
    for (const value of Object.values(clean)) expect(String(value)).toMatch(/^\d+$/);
  });

  it('has no payload field a thread key or an action wording could travel in', () => {
    const clean = sanitizeAnalyticsPayload({
      // @ts-expect-error deliberately passing keys that are not on the contract
      threadKey: 'implicated_driver::SLP-3',
      memberSentence: PLANTED.sentence,
      painLocation: PLANTED.painLocation,
      gradeCount: '7',
    });
    expect(clean).toEqual({ gradeCount: '7' });
  });

  it('coaching_thread_escalated and coaching_escalation_resolved carry the action type slug only', () => {
    const clean = sanitizeAnalyticsPayload({
      actionType: 'reset',
      // @ts-expect-error deliberately passing a key that is not on the contract
      threadKey: 'behavioral_friction::daily_reset_incomplete',
    });
    expect(clean).toEqual({ actionType: 'reset' });
  });

  it('drops any value long enough to be prose even under an allowed key', () => {
    const clean = sanitizeAnalyticsPayload({ actionType: PLANTED.sentence });
    expect(clean.actionType).toBeUndefined();
  });
});
