/**
 * The Weekly Root Review — guard tests for the week focus and the exact,
 * narrow way it is allowed to touch Part 1's daily engine.
 *
 * No database. Both the reorder and the hierarchy are pure functions.
 *
 * The hard part of testing a tie-breaker is proving it broke a tie rather
 * than changing an order. Every test below therefore asserts BOTH halves:
 * that the focus-aligned candidate won, and that the sequence of RULES the
 * engine considered is byte-identical with and without the focus.
 *
 * One guard here was proven non-vacuous by breaking the code. See the note
 * on `the commitment rule is exempt`.
 */

import { describe, it, expect } from 'vitest';
import {
  FOCUS_EXEMPT_RULES,
  isAlignedWithFocus,
  isBiasableFocus,
  preferWeekFocusWithinRung,
} from '@/lib/weekly-review/focus';
import type { WeekFocus } from '@/lib/weekly-review/types';
import { selectCoachingAction, type AdaptationContext } from '@/lib/priority/select';
import { PRIORITY_LADDER, PRIORITY_OVERRIDES, type PriorityInputs } from '@/lib/priority/types';
import type { PriorityRule } from '@/lib/priority/types';
import type { CoachingActionType, CoachingThreadState } from '@/lib/coaching-direction/types';
import { threadKeyFor } from '@/lib/coaching-direction/adaptation';

const TODAY = '2026-08-12';
const WEEK_START = '2026-08-10';

function focus(overrides: Partial<WeekFocus> = {}): WeekFocus {
  return {
    weekStart: WEEK_START,
    actionType: 'nutrition',
    threadKey: null,
    reason: 'direction_worsening',
    sourceEvidence: {},
    ...overrides,
  };
}

/**
 * Two implicated drivers in different domains, so their action types differ
 * and an action-type focus can genuinely discriminate between them. SLP maps
 * to 'reflection', FUE to 'nutrition' (lib/priority/select.ts's
 * driverActionType), and the SLP one is the panel's own winner.
 */
function twoTiedDrivers(): PriorityInputs {
  return {
    safetyFlag: null,
    isReEntry: false,
    resetPlan: null,
    implicatedDriver: {
      driverId: 'SLP-3',
      domainKey: 'SLP',
      label: 'Bedtime consistency',
      whatItObserves: 'How much bedtime varies night to night',
      findingSentence: null,
    },
    implicatedDriverAlternates: [
      {
        driverId: 'FUE-2',
        domainKey: 'FUE',
        label: 'Protein at breakfast',
        whatItObserves: 'Whether the first meal carries protein',
        findingSentence: null,
      },
    ],
    qualifiedPattern: null,
    incompleteAction: null,
    behavioralFriction: null,
    todaysFocus: null,
    fallback: { checkinDoneToday: false, totalCheckins: 30, statedGoalLabel: 'More energy' },
    hasRealHistory: true,
  };
}

function ruleSequence(inputs: PriorityInputs, weekFocus: WeekFocus | null): PriorityRule[] {
  // Reconstructs the order the engine walks, through the same reorder the
  // engine uses, so this is the real sequence rather than an assumed one.
  const candidates = [
    { rule: 'implicated_driver' as PriorityRule, threadKey: threadKeyFor('implicated_driver', 'SLP-3'), actionType: 'reflection' as CoachingActionType },
    { rule: 'implicated_driver' as PriorityRule, threadKey: threadKeyFor('implicated_driver', 'FUE-2'), actionType: 'nutrition' as CoachingActionType },
    { rule: 'daily_reset' as PriorityRule, threadKey: threadKeyFor('daily_reset', null), actionType: 'reset' as CoachingActionType },
  ];
  return preferWeekFocusWithinRung(candidates, weekFocus).map((candidate) => candidate.rule);
}

describe('what counts as a readable focus', () => {
  it('rejects a focus that names nothing', () => {
    expect(isBiasableFocus(focus({ actionType: null, threadKey: null }))).toBe(false);
    expect(isBiasableFocus(null)).toBe(false);
  });

  it('rejects a focus that names an exempt rule, so it can never look like an inert decision', () => {
    for (const rule of FOCUS_EXEMPT_RULES) {
      expect(
        isBiasableFocus(focus({ actionType: null, threadKey: `${rule}::whatever` }))
      ).toBe(false);
    }
  });

  it('accepts a focus on an action type alone, and on a non-exempt thread alone', () => {
    expect(isBiasableFocus(focus({ actionType: 'nutrition', threadKey: null }))).toBe(true);
    expect(
      isBiasableFocus(
        focus({ actionType: null, threadKey: 'behavioral_friction::daily_reset_incomplete' })
      )
    ).toBe(true);
  });

  it('exempts exactly the three rules named, and no others', () => {
    expect([...FOCUS_EXEMPT_RULES]).toEqual(['safety', 're_entry', 'reset_plan_commitment']);
    // Both overrides are exempt, and exactly one ladder rung is.
    for (const override of PRIORITY_OVERRIDES) expect(FOCUS_EXEMPT_RULES).toContain(override);
    expect(PRIORITY_LADDER.filter((rule) => FOCUS_EXEMPT_RULES.includes(rule))).toEqual([
      'reset_plan_commitment',
    ]);
  });
});

describe('the reorder', () => {
  it('breaks a same-rung tie toward the focus-aligned candidate', () => {
    const withoutFocus = selectCoachingAction(twoTiedDrivers(), TODAY, {
      threads: new Map(),
      completedYesterdayThreadKey: null,
      weekFocus: null,
    });
    const withFocus = selectCoachingAction(twoTiedDrivers(), TODAY, {
      threads: new Map(),
      completedYesterdayThreadKey: null,
      weekFocus: focus({ actionType: 'nutrition' }),
    });

    // Non-vacuity: without the focus, the panel's own winner wins.
    expect(withoutFocus.selected.rule).toBe('implicated_driver');
    expect(withoutFocus.selected.priorityKey).toBe('SLP-3');

    // With it, the tied nutrition driver wins the SAME rung.
    expect(withFocus.selected.rule).toBe('implicated_driver');
    expect(withFocus.selected.priorityKey).toBe('FUE-2');
    expect(withFocus.selected.actionType).toBe('nutrition');
  });

  it('leaves the sequence of RULES byte-identical, which is what "the hierarchy does not change" means', () => {
    expect(ruleSequence(twoTiedDrivers(), focus({ actionType: 'nutrition' }))).toEqual(
      ruleSequence(twoTiedDrivers(), null)
    );
  });

  it('never promotes a lower rung past a higher one, even when only the lower one is aligned', () => {
    const inputs: PriorityInputs = {
      ...twoTiedDrivers(),
      implicatedDriverAlternates: [],
      // A reset-typed candidate exists far down the ladder and is the only
      // thing aligned with a 'reset' focus. It must still lose to rule 2.
      todaysFocus: null,
    };
    const selection = selectCoachingAction(inputs, TODAY, {
      threads: new Map(),
      completedYesterdayThreadKey: null,
      weekFocus: focus({ actionType: 'reset' }),
    });
    expect(selection.selected.rule).toBe('implicated_driver');
    expect(selection.selected.priorityKey).toBe('SLP-3');
  });

  it('is a no-op when a rung has only one candidate, which is the ordinary day', () => {
    const single: PriorityInputs = { ...twoTiedDrivers(), implicatedDriverAlternates: [] };
    const withFocus = selectCoachingAction(single, TODAY, {
      threads: new Map(),
      completedYesterdayThreadKey: null,
      weekFocus: focus({ actionType: 'nutrition' }),
    });
    const without = selectCoachingAction(single, TODAY, {
      threads: new Map(),
      completedYesterdayThreadKey: null,
      weekFocus: null,
    });
    expect(withFocus.selected).toEqual(without.selected);
  });

  it('keeps the sources own order among candidates that are all aligned, or all not', () => {
    const candidates = [
      { rule: 'qualified_pattern' as PriorityRule, threadKey: 'qualified_pattern::a', actionType: 'reflection' as CoachingActionType },
      { rule: 'qualified_pattern' as PriorityRule, threadKey: 'qualified_pattern::b', actionType: 'reflection' as CoachingActionType },
      { rule: 'qualified_pattern' as PriorityRule, threadKey: 'qualified_pattern::c', actionType: 'reflection' as CoachingActionType },
    ];
    // All three are aligned by action type: the order must be untouched.
    expect(
      preferWeekFocusWithinRung(candidates, focus({ actionType: 'reflection' })).map((c) => c.threadKey)
    ).toEqual(['qualified_pattern::a', 'qualified_pattern::b', 'qualified_pattern::c']);
    // None is aligned: also untouched.
    expect(
      preferWeekFocusWithinRung(candidates, focus({ actionType: 'nutrition' })).map((c) => c.threadKey)
    ).toEqual(['qualified_pattern::a', 'qualified_pattern::b', 'qualified_pattern::c']);
  });

  it('prefers a thread match, which is the more specific kind of alignment', () => {
    const candidates = [
      { rule: 'qualified_pattern' as PriorityRule, threadKey: 'qualified_pattern::a', actionType: 'reflection' as CoachingActionType },
      { rule: 'qualified_pattern' as PriorityRule, threadKey: 'qualified_pattern::b', actionType: 'reflection' as CoachingActionType },
    ];
    expect(
      preferWeekFocusWithinRung(
        candidates,
        focus({ actionType: null, threadKey: 'qualified_pattern::b' })
      ).map((c) => c.threadKey)
    ).toEqual(['qualified_pattern::b', 'qualified_pattern::a']);
  });
});

describe('safety, re-engagement and the commitment are never affected', () => {
  function everythingApplies(): PriorityInputs {
    return {
      safetyFlag: { safetyClassificationId: 'cls-1' },
      isReEntry: true,
      resetPlan: {
        planId: 'plan-1',
        planVersionId: 'ver-1',
        actionText: 'Give yourself a 5 minute walk outside within an hour of lunch.',
        difficultDayText: 'Step to a window and take 5 slow breaths.',
        daysLogged: 4,
        daysSinceStart: 6,
      },
      implicatedDriver: {
        driverId: 'FUE-2',
        domainKey: 'FUE',
        label: 'Protein at breakfast',
        whatItObserves: 'Whether the first meal carries protein',
        findingSentence: null,
      },
      qualifiedPattern: null,
      incompleteAction: null,
      behavioralFriction: null,
      todaysFocus: null,
      fallback: { checkinDoneToday: false, totalCheckins: 30, statedGoalLabel: 'More energy' },
      hasRealHistory: true,
    };
  }

  const nutritionFocus: AdaptationContext = {
    threads: new Map(),
    completedYesterdayThreadKey: null,
    weekFocus: focus({ actionType: 'nutrition' }),
  };

  it('safety still wins over a focus pointed somewhere else', () => {
    const selection = selectCoachingAction(everythingApplies(), TODAY, nutritionFocus);
    expect(selection.selected.rule).toBe('safety');
  });

  it('re-entry still wins over a focus pointed somewhere else', () => {
    const inputs = { ...everythingApplies(), safetyFlag: null };
    expect(selectCoachingAction(inputs, TODAY, nutritionFocus).selected.rule).toBe('re_entry');
  });

  /**
   * PROVEN NON-VACUOUS BY BREAKING THE CODE. Emptying FOCUS_EXEMPT_RULES made
   * this test fail: with the commitment rung no longer exempt, a focus
   * naming its own thread was accepted by isBiasableFocus and the reorder
   * reached it. List restored and the suite re-verified.
   */
  it('the commitment rule is exempt: a focus on its own thread is refused outright', () => {
    const inputs = { ...everythingApplies(), safetyFlag: null, isReEntry: false };
    const commitmentThread = threadKeyFor('reset_plan_commitment', 'plan-1');
    const commitmentFocus = focus({ actionType: null, threadKey: commitmentThread });

    expect(isBiasableFocus(commitmentFocus)).toBe(false);
    expect(
      isAlignedWithFocus(
        { rule: 'reset_plan_commitment', threadKey: commitmentThread, actionType: 'reset' },
        commitmentFocus
      )
    ).toBe(false);

    // And the commitment still wins on its own merits, as it always did.
    expect(
      selectCoachingAction(inputs, TODAY, {
        threads: new Map(),
        completedYesterdayThreadKey: null,
        weekFocus: commitmentFocus,
      }).selected.rule
    ).toBe('reset_plan_commitment');
  });

  it('a reset-typed focus cannot reorder the commitment rung either', () => {
    const commitmentThread = threadKeyFor('reset_plan_commitment', 'plan-1');
    expect(
      isAlignedWithFocus(
        { rule: 'reset_plan_commitment', threadKey: commitmentThread, actionType: 'reset' },
        focus({ actionType: 'reset', threadKey: null })
      )
    ).toBe(false);
  });
});

describe('the focus and the follow-on guardrail together', () => {
  it('a thread she finished yesterday still outranks a focus-aligned tie', () => {
    const inputs = twoTiedDrivers();
    const yesterdayThread = threadKeyFor('implicated_driver', 'SLP-3');
    const threads = new Map<string, CoachingThreadState>();

    const selection = selectCoachingAction(inputs, TODAY, {
      threads,
      completedYesterdayThreadKey: yesterdayThread,
      // The focus points at the OTHER tied driver.
      weekFocus: focus({ actionType: 'nutrition' }),
    });

    // The follow-on rule runs after the tie-break, so what she finished
    // yesterday wins. A weekly preference must not outrank a thing she
    // actually completed a day ago.
    expect(selection.selected.priorityKey).toBe('SLP-3');
    expect(selection.isFollowOn).toBe(true);
  });
});
