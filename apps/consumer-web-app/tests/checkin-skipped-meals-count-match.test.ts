/**
 * Daily Reset "Your body" screen, reported live on app.mefwellness.com
 * (2026-08-14): "How many meals did you skip today?" answered 2, then
 * "Which meal(s) did you skip?" only ever accepted one meal, because the
 * follow-up was single_select with a fake "More than one" option. The two
 * answers could contradict each other and nothing noticed.
 *
 * These tests pin all four halves of the fix:
 *   1. the count-matching rule itself (exactly as many selections as the
 *      number she gave);
 *   2. count 0 never showing the follow-up at all;
 *   3. changing the count re-validating against selections already made,
 *      without throwing those selections away;
 *   4. the rule staying DATA-driven, so it applies to any count parent a
 *      coach pairs with a multi_select follow-up, not just this question.
 */
import { describe, it, expect } from 'vitest';
import {
  countMatchBlockedReason,
  parentQuestionKey,
  requiredSelectionCount,
  selectionCount,
} from '../lib/daily-checkin-adaptive/followUpValidation';
import { isLocalFollowUpEligible } from '../lib/daily-checkin-adaptive/localFollowUps';
import type { DriverProbeQuestion } from '../lib/daily-checkin-adaptive/types';

function question(overrides: Partial<DriverProbeQuestion> = {}): DriverProbeQuestion {
  return {
    questionKey: 'checkin_probe.example',
    driverId: null,
    prompt: 'Example?',
    responseType: 'single_select',
    options: [],
    storage: 'probe_answer',
    dailyCheckinsColumn: null,
    wearableMetricCode: null,
    requires: [],
    excludes: [],
    priority: 0,
    active: true,
    screen: 'morning',
    displayStyle: null,
    ...overrides,
  };
}

const MEALS_SKIPPED = question({
  questionKey: 'checkin_probe.meals_skipped_today',
  driverId: 'FUE-2',
  prompt: 'How many meals did you skip today?',
  responseType: 'count',
  options: [0, 1, 2, 3],
});

/** The question as migration 157 leaves it: a true multi-select over the three meals, with no "More than one" stand-in. */
const WHICH_MEALS = question({
  questionKey: 'checkin_probe.skipped_meal_which',
  prompt: 'Which meal(s) did you skip?',
  responseType: 'multi_select',
  options: [
    { value: 'breakfast', label: 'Breakfast' },
    { value: 'lunch', label: 'Lunch' },
    { value: 'dinner', label: 'Dinner' },
  ],
  requires: [{ question_key: 'checkin_probe.meals_skipped_today', op: 'gte', value: 1 }],
});

const BANK = [MEALS_SKIPPED, WHICH_MEALS];

describe('count = 2 requires exactly two meals before the screen validates', () => {
  const answered = { 'checkin_probe.meals_skipped_today': 2 };

  it('nothing selected yet: blocked, and the reason names the number she gave', () => {
    expect(countMatchBlockedReason(WHICH_MEALS, BANK, answered, null)).toBe('Select 2 meals.');
  });

  it('one meal selected: still blocked, because one is not two', () => {
    expect(countMatchBlockedReason(WHICH_MEALS, BANK, answered, ['breakfast'])).toBe('Select 2 meals.');
  });

  it('two meals selected: satisfied, no reason at all', () => {
    expect(countMatchBlockedReason(WHICH_MEALS, BANK, answered, ['breakfast', 'lunch'])).toBeNull();
  });

  it('three meals selected against a count of 2: blocked, and the line offers the other way out', () => {
    expect(countMatchBlockedReason(WHICH_MEALS, BANK, answered, ['breakfast', 'lunch', 'dinner'])).toBe(
      'Select only 2 meals, or change the number above.'
    );
  });

  it('count = 3 needs all three', () => {
    const three = { 'checkin_probe.meals_skipped_today': 3 };
    expect(countMatchBlockedReason(WHICH_MEALS, BANK, three, ['breakfast', 'lunch'])).toBe('Select 3 meals.');
    expect(countMatchBlockedReason(WHICH_MEALS, BANK, three, ['breakfast', 'lunch', 'dinner'])).toBeNull();
  });

  it('count = 1 asks for one meal, singular, not "1 meals"', () => {
    const one = { 'checkin_probe.meals_skipped_today': 1 };
    expect(countMatchBlockedReason(WHICH_MEALS, BANK, one, [])).toBe('Select 1 meal.');
    expect(countMatchBlockedReason(WHICH_MEALS, BANK, one, ['dinner'])).toBeNull();
  });

  it('no member-facing reason contains an em dash', () => {
    const lines = [
      countMatchBlockedReason(WHICH_MEALS, BANK, answered, null),
      countMatchBlockedReason(WHICH_MEALS, BANK, answered, ['breakfast']),
      countMatchBlockedReason(WHICH_MEALS, BANK, answered, ['breakfast', 'lunch', 'dinner']),
    ];
    for (const line of lines) expect(line ?? '').not.toContain('—');
  });
});

describe('count = 0 hides the follow-up entirely, so there is nothing to validate', () => {
  it('the eligibility rule (requires gte 1) is what hides it, and it does', () => {
    expect(isLocalFollowUpEligible(WHICH_MEALS, { 'checkin_probe.meals_skipped_today': 0 })).toBe(false);
    expect(isLocalFollowUpEligible(WHICH_MEALS, { 'checkin_probe.meals_skipped_today': 1 })).toBe(true);
    expect(isLocalFollowUpEligible(WHICH_MEALS, { 'checkin_probe.meals_skipped_today': 2 })).toBe(true);
    expect(isLocalFollowUpEligible(WHICH_MEALS, { 'checkin_probe.meals_skipped_today': 3 })).toBe(true);
  });

  it('and a count of 0 imposes no selection requirement either, so it can never block a screen it is not even on', () => {
    expect(requiredSelectionCount(WHICH_MEALS, BANK, { 'checkin_probe.meals_skipped_today': 0 })).toBeNull();
    expect(countMatchBlockedReason(WHICH_MEALS, BANK, { 'checkin_probe.meals_skipped_today': 0 }, null)).toBeNull();
  });

  it('the parent unanswered blocks nothing (the follow-up is not shown yet either)', () => {
    expect(countMatchBlockedReason(WHICH_MEALS, BANK, {}, null)).toBeNull();
  });
});

describe('changing the count re-validates, and keeps selections that are still valid', () => {
  it('two meals picked, then the count drops to 1: same selections, now blocked as too many', () => {
    const picked = ['breakfast', 'lunch'];
    expect(countMatchBlockedReason(WHICH_MEALS, BANK, { 'checkin_probe.meals_skipped_today': 2 }, picked)).toBeNull();
    expect(countMatchBlockedReason(WHICH_MEALS, BANK, { 'checkin_probe.meals_skipped_today': 1 }, picked)).toBe(
      'Select only 1 meal, or change the number above.'
    );
  });

  it('two meals picked, then the count rises to 3: same selections, now blocked as too few', () => {
    const picked = ['breakfast', 'lunch'];
    expect(countMatchBlockedReason(WHICH_MEALS, BANK, { 'checkin_probe.meals_skipped_today': 3 }, picked)).toBe(
      'Select 3 meals.'
    );
  });

  it('validation is a pure read of the current answers, so nothing it does can discard a selection', () => {
    const picked = ['breakfast', 'lunch'];
    countMatchBlockedReason(WHICH_MEALS, BANK, { 'checkin_probe.meals_skipped_today': 1 }, picked);
    countMatchBlockedReason(WHICH_MEALS, BANK, { 'checkin_probe.meals_skipped_today': 3 }, picked);
    expect(picked).toEqual(['breakfast', 'lunch']);
  });
});

describe('the rule is data-driven, and fails open on every shape it does not understand', () => {
  it('a single_select follow-up of a count parent gets no count requirement (there is nothing it could satisfy) — the type change is the fix, not a validation bolted onto the old shape', () => {
    const oldShape = question({ ...WHICH_MEALS, responseType: 'single_select' });
    expect(requiredSelectionCount(oldShape, BANK, { 'checkin_probe.meals_skipped_today': 2 })).toBeNull();
  });

  it('a multi_select follow-up of a NON-count parent gets no count requirement', () => {
    const digestionRating = question({ questionKey: 'checkin_probe.digestion_rating', responseType: 'scale', options: [1, 2, 3, 4, 5] });
    const symptomType = question({
      questionKey: 'checkin_probe.digestive_symptom_type',
      responseType: 'multi_select',
      options: [
        { value: 'bloating', label: 'Bloating' },
        { value: 'gas', label: 'Gas' },
      ],
      requires: [{ question_key: 'checkin_probe.digestion_rating', op: 'lte', value: 2 }],
    });
    expect(requiredSelectionCount(symptomType, [digestionRating, symptomType], { 'checkin_probe.digestion_rating': 2 })).toBeNull();
    expect(countMatchBlockedReason(symptomType, [digestionRating, symptomType], { 'checkin_probe.digestion_rating': 2 }, [])).toBeNull();
  });

  it("the parent missing from today's question list blocks nothing", () => {
    expect(requiredSelectionCount(WHICH_MEALS, [WHICH_MEALS], { 'checkin_probe.meals_skipped_today': 2 })).toBeNull();
  });

  it('a count larger than the follow-up has options is clamped, so "select 4" of 3 meals is never demanded', () => {
    const impossible = question({ ...MEALS_SKIPPED, options: [0, 1, 2, 3, 4] });
    expect(requiredSelectionCount(WHICH_MEALS, [impossible, WHICH_MEALS], { 'checkin_probe.meals_skipped_today': 4 })).toBe(3);
    expect(
      countMatchBlockedReason(WHICH_MEALS, [impossible, WHICH_MEALS], { 'checkin_probe.meals_skipped_today': 4 }, [
        'breakfast',
        'lunch',
        'dinner',
      ])
    ).toBeNull();
  });

  it('a non-numeric or negative parent answer blocks nothing', () => {
    expect(requiredSelectionCount(WHICH_MEALS, BANK, { 'checkin_probe.meals_skipped_today': 'two' })).toBeNull();
    expect(requiredSelectionCount(WHICH_MEALS, BANK, { 'checkin_probe.meals_skipped_today': -1 })).toBeNull();
    expect(requiredSelectionCount(WHICH_MEALS, BANK, { 'checkin_probe.meals_skipped_today': 1.5 })).toBeNull();
  });

  it('a follow-up with no requires rule at all has no parent and no requirement', () => {
    const orphan = question({ ...WHICH_MEALS, requires: [] });
    expect(parentQuestionKey(orphan)).toBeNull();
    expect(requiredSelectionCount(orphan, BANK, { 'checkin_probe.meals_skipped_today': 2 })).toBeNull();
  });
});

describe('selectionCount tolerates every answer shape a converted question can hold', () => {
  it('an array counts its entries', () => {
    expect(selectionCount([])).toBe(0);
    expect(selectionCount(['breakfast', 'lunch'])).toBe(2);
  });

  it('a bare string is a single answer recorded before the multi-select conversion, never read as zero', () => {
    expect(selectionCount('breakfast')).toBe(1);
  });

  it('null, undefined and an empty string are nothing selected', () => {
    expect(selectionCount(null)).toBe(0);
    expect(selectionCount(undefined)).toBe(0);
    expect(selectionCount('')).toBe(0);
  });
});
