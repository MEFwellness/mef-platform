/**
 * Priority Card — guard tests for the selection hierarchy.
 *
 * The thing worth guarding here is PRECEDENCE, and precedence tests are
 * the easiest kind of test to write vacuously: assert that rule 3 wins
 * when rule 3 is the only rule with an input, and you have proved nothing
 * except that the function returns something.
 *
 * So every precedence test below is built from ONE fully-populated input
 * set in which EVERY ladder rule applies at once, and each test removes
 * exactly the rules above the one under test. `applicableRules` is used to
 * assert, in the test itself, that the losing rules really were available
 * and really did lose. `describe('non-vacuity')` at the bottom then proves
 * the fixture is doing that job, by showing each rule wins on its own when
 * the ones above it are removed and loses when they are present.
 */

import { describe, it, expect } from 'vitest';
import { applicableRules, selectPriority } from '@/lib/priority/select';
import { PRIORITY_LADDER, type PriorityInputs } from '@/lib/priority/types';
import {
  classifyPresence,
  isReEntry,
  RE_ENTRY_MIN_ABSENCE_DAYS,
} from '@/lib/return-greeting/absence';
import {
  RETURN_GREETING_MIN_GAP_DAYS,
  RETURN_GREETING_TEXT,
} from '@/lib/return-greeting/copy';

const TODAY = '2026-08-12';

/** Every ladder rule applies at once. Individual tests strip rules OFF this. */
function allRulesApply(): PriorityInputs {
  return {
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
      driverId: 'SLP-3',
      label: 'Bedtime consistency',
      whatItObserves: 'How much bedtime varies night to night',
      findingSentence: 'On nights you get to bed at a steadier time, your next-day energy tends to be higher.',
    },
    incompleteAction: {
      key: 'wbsa',
      name: 'Whole-Body Systems Assessment',
      href: '/assessment/wbsa',
      resumeHint: 'Your answers so far are saved.',
      lastTouchedLocalDate: '2026-08-05',
    },
    todaysFocus: {
      feedItemId: 'feed-1',
      focusText: 'Notice where your energy actually goes today.',
      reasonText: 'Your last few check-ins pointed at afternoons.',
      suggestedAction: 'Take one short walk after lunch.',
    },
    // The final fallback always applies, which is exactly why the
    // precedence tests below are meaningful: every real rule that wins
    // does so over a genuinely available alternative, never by default.
    fallback: {
      checkinDoneToday: false,
      totalCheckins: 12,
      statedGoalLabel: 'Sleep better',
    },
    hasRealHistory: true,
  };
}

describe('the hierarchy picks exactly one winner', () => {
  it('returns a single priority, never a list, even when every rule applies', () => {
    const result = selectPriority(allRulesApply(), TODAY);

    expect(result).not.toBeNull();
    // The return type is a single object. This assertion exists so the
    // "never two cards, never a list" requirement is pinned by a test
    // rather than only by the type signature.
    expect(Array.isArray(result)).toBe(false);
    expect(typeof result?.rule).toBe('string');
  });

  it('every rule really is available in the fixture, so the precedence tests below are not vacuous', () => {
    const available = applicableRules(allRulesApply());

    expect(available).toContain('re_entry');

    // Every real rule is on the table at once. The last two ladder entries
    // are the two halves of one question and are mutually exclusive by
    // design, so exactly one of them is available here rather than both.
    const realRules = PRIORITY_LADDER.filter(
      (rule) => rule !== 'daily_reset' && rule !== 'gentle_focus'
    );
    for (const rule of realRules) {
      expect(available).toContain(rule);
    }

    const fallbackHalves = available.filter(
      (rule) => rule === 'daily_reset' || rule === 'gentle_focus'
    );
    expect(fallbackHalves).toHaveLength(1);

    // re-entry + every real rule + exactly one fallback half.
    expect(available).toHaveLength(realRules.length + 2);
  });
});

describe('rule 0 — re-entry overrides everything', () => {
  it('wins over all four ladder rules when they are all also applicable', () => {
    const inputs = allRulesApply();

    // Proof the other four were genuinely on the table.
    expect(applicableRules(inputs)).toEqual([
      're_entry',
      'reset_plan_commitment',
      'implicated_driver',
      'incomplete_action',
      'todays_focus',
      // The fallback is always applicable, which is what makes every
      // precedence assertion here a real decision rather than a default.
      'daily_reset',
    ]);

    expect(selectPriority(inputs, TODAY)?.rule).toBe('re_entry');
  });

  it('carries no reason line, ever, because the only available fact is the length of her absence', () => {
    const result = selectPriority(allRulesApply(), TODAY);

    expect(result?.rule).toBe('re_entry');
    expect(result?.reason).toBeNull();
  });

  it('never mentions a gap length, a missed day, or a streak', () => {
    const result = selectPriority(allRulesApply(), TODAY);
    const text = `${result?.title} ${result?.help}`.toLowerCase();

    expect(text).not.toContain('missed');
    expect(text).not.toContain('streak');
    expect(text).not.toContain('behind');
    expect(text).not.toContain('overdue');
    expect(text).not.toMatch(/\d+\s*days?/);
  });

  it('stops overriding the moment it is off, handing the screen straight back to rule 1', () => {
    const inputs = { ...allRulesApply(), isReEntry: false };
    expect(selectPriority(inputs, TODAY)?.rule).toBe('reset_plan_commitment');
  });
});

describe('rule 1 — an active Reset Plan commitment', () => {
  const inputs = (): PriorityInputs => ({ ...allRulesApply(), isReEntry: false });

  it('wins over rules 2, 3 and 4 while all three are still applicable', () => {
    const i = inputs();
    expect(applicableRules(i)).toEqual([
      'reset_plan_commitment',
      'implicated_driver',
      'incomplete_action',
      'todays_focus',
      'daily_reset',
    ]);
    expect(selectPriority(i, TODAY)?.rule).toBe('reset_plan_commitment');
  });

  it('shows her own agreed action text verbatim, never a rewording', () => {
    const i = inputs();
    expect(selectPriority(i, TODAY)?.title).toBe(i.resetPlan?.actionText);
  });

  it("offers the plan's own difficult-day version as the smaller step", () => {
    const i = inputs();
    expect(selectPriority(i, TODAY)?.help).toBe(i.resetPlan?.difficultDayText);
  });

  it('gives a real, counted reason when she has logged days', () => {
    const result = selectPriority(inputs(), TODAY);
    expect(result?.reason).toBe('You have logged this on 4 days since your plan started.');
  });

  it('shows no reason at all on day one rather than inventing one', () => {
    const i = inputs();
    const result = selectPriority(
      { ...i, resetPlan: { ...i.resetPlan!, daysLogged: 0, daysSinceStart: 0 } },
      TODAY
    );
    expect(result?.rule).toBe('reset_plan_commitment');
    expect(result?.reason).toBeNull();
  });

  it('says "1 day" and not "1 days"', () => {
    const i = inputs();
    const result = selectPriority({ ...i, resetPlan: { ...i.resetPlan!, daysLogged: 1 } }, TODAY);
    expect(result?.reason).toContain('1 day since');
  });
});

describe('rule 2 — a strongly implicated, goal-relevant driver', () => {
  const inputs = (): PriorityInputs => ({
    ...allRulesApply(),
    isReEntry: false,
    resetPlan: null,
  });

  it('wins over rules 3 and 4 while both are still applicable', () => {
    const i = inputs();
    expect(applicableRules(i)).toEqual([
      'implicated_driver',
      'incomplete_action',
      'todays_focus',
      'daily_reset',
    ]);
    expect(selectPriority(i, TODAY)?.rule).toBe('implicated_driver');
  });

  it("uses the correlation engine's own member sentence as the reason", () => {
    const i = inputs();
    expect(selectPriority(i, TODAY)?.reason).toBe(i.implicatedDriver?.findingSentence);
  });

  it('shows the priority with no reason line when no earned finding sentence backs it', () => {
    const i = inputs();
    const result = selectPriority(
      { ...i, implicatedDriver: { ...i.implicatedDriver!, findingSentence: null } },
      TODAY
    );
    expect(result?.rule).toBe('implicated_driver');
    expect(result?.title).toContain('bedtime consistency');
    expect(result?.reason).toBeNull();
  });

  it('reads as an observation rather than an instruction', () => {
    const title = selectPriority(inputs(), TODAY)?.title ?? '';
    expect(title.toLowerCase()).not.toContain('you should');
    expect(title.toLowerCase()).not.toContain('you must');
    expect(title.toLowerCase()).not.toContain('you need to');
  });
});

describe('rule 3 — an incomplete high-value action', () => {
  const inputs = (): PriorityInputs => ({
    ...allRulesApply(),
    isReEntry: false,
    resetPlan: null,
    implicatedDriver: null,
  });

  it('wins over rule 4 while rule 4 is still applicable', () => {
    const i = inputs();
    expect(applicableRules(i)).toEqual(['incomplete_action', 'todays_focus', 'daily_reset']);
    expect(selectPriority(i, TODAY)?.rule).toBe('incomplete_action');
  });

  it('names the real date she left it, from the source system', () => {
    expect(selectPriority(inputs(), TODAY)?.reason).toBe(
      'You started this on Aug 5 and it is still open.'
    );
  });

  it('shows no reason when the source has no honest timestamp', () => {
    const i = inputs();
    const result = selectPriority(
      { ...i, incompleteAction: { ...i.incompleteAction!, lastTouchedLocalDate: null } },
      TODAY
    );
    expect(result?.rule).toBe('incomplete_action');
    expect(result?.reason).toBeNull();
  });

  it('shows no reason when she actually touched it today, since nothing was abandoned', () => {
    const i = inputs();
    const result = selectPriority(
      { ...i, incompleteAction: { ...i.incompleteAction!, lastTouchedLocalDate: TODAY } },
      TODAY
    );
    expect(result?.reason).toBeNull();
  });

  it('carries the link to pick it back up', () => {
    expect(selectPriority(inputs(), TODAY)?.href).toBe('/assessment/wbsa');
  });
});

describe("rule 4 — Today's Focus, the fallback", () => {
  const inputs = (): PriorityInputs => ({
    ...allRulesApply(),
    isReEntry: false,
    resetPlan: null,
    implicatedDriver: null,
    incompleteAction: null,
  });

  it('wins only when nothing above it applies', () => {
    const i = inputs();
    expect(applicableRules(i)).toEqual(['todays_focus', 'daily_reset']);
    expect(selectPriority(i, TODAY)?.rule).toBe('todays_focus');
  });

  it("passes the Coaching Brain's focus text through unchanged", () => {
    const i = inputs();
    expect(selectPriority(i, TODAY)?.title).toBe(i.todaysFocus?.focusText);
  });

  it('gives a brand-new member the focus with NO reason line, never a fabricated insight', () => {
    const i = { ...inputs(), hasRealHistory: false };
    const result = selectPriority(i, TODAY);

    expect(result?.rule).toBe('todays_focus');
    expect(result?.title).toBe(i.todaysFocus?.focusText);
    expect(result?.reason).toBeNull();
  });

  it('gives a member with real history the reason, since it is backed by her own data', () => {
    const result = selectPriority(inputs(), TODAY);
    expect(result?.reason).toBe('Your last few check-ins pointed at afternoons.');
  });
});

describe('the final fallback — a brand-new member always gets exactly one honest card', () => {
  /** Every evidence-backed rule declines. This is the ordinary state of a member on day one. */
  function nothingButTheFallback(fallback: PriorityInputs['fallback']): PriorityInputs {
    return {
      isReEntry: false,
      resetPlan: null,
      implicatedDriver: null,
      incompleteAction: null,
      todaysFocus: null,
      fallback,
      hasRealHistory: false,
    };
  }

  it('never returns null, so the pop-up always has something to carry', () => {
    const result = selectPriority(
      nothingButTheFallback({ checkinDoneToday: false, totalCheckins: 0, statedGoalLabel: null }),
      TODAY
    );
    expect(result).not.toBeNull();
    expect(result.title.length).toBeGreaterThan(0);
  });

  it('offers the Daily Reset when today is not done yet, with a link to it', () => {
    const result = selectPriority(
      nothingButTheFallback({ checkinDoneToday: false, totalCheckins: 4, statedGoalLabel: null }),
      TODAY
    );
    expect(result.rule).toBe('daily_reset');
    expect(result.href).toBe('/checkin');
  });

  it('gives a day-one member NO reason line, since she has no history to describe', () => {
    const result = selectPriority(
      nothingButTheFallback({ checkinDoneToday: false, totalCheckins: 0, statedGoalLabel: null }),
      TODAY
    );
    expect(result.rule).toBe('daily_reset');
    expect(result.reason).toBeNull();
  });

  it('gives a real count once one exists, and never mentions missed days or a streak', () => {
    const result = selectPriority(
      nothingButTheFallback({ checkinDoneToday: false, totalCheckins: 4, statedGoalLabel: null }),
      TODAY
    );
    expect(result.reason).toContain('4 days logged');
    expect(result.reason?.toLowerCase()).not.toContain('missed');
    expect(result.reason?.toLowerCase()).not.toContain('streak');
  });

  it('switches to a gentle focus once today is already done', () => {
    const result = selectPriority(
      nothingButTheFallback({ checkinDoneToday: true, totalCheckins: 4, statedGoalLabel: 'Sleep better' }),
      TODAY
    );
    expect(result.rule).toBe('gentle_focus');
  });

  it('quotes her own stated onboarding goal rather than interpreting it', () => {
    const result = selectPriority(
      nothingButTheFallback({ checkinDoneToday: true, totalCheckins: 1, statedGoalLabel: 'Sleep better' }),
      TODAY
    );
    expect(result.title).toContain('sleep better');
    expect(result.reason).toBe('You chose that when you joined.');
  });

  it('makes NO claim at all about a member who never chose a goal', () => {
    const result = selectPriority(
      nothingButTheFallback({ checkinDoneToday: true, totalCheckins: 0, statedGoalLabel: null }),
      TODAY
    );
    expect(result.rule).toBe('gentle_focus');
    expect(result.reason).toBeNull();
    expect(result.title.toLowerCase()).not.toContain('you have');
    expect(result.title.toLowerCase()).not.toContain('your pattern');
  });

  it('produces exactly one card, never two, for a brand-new member', () => {
    const applicable = applicableRules(
      nothingButTheFallback({ checkinDoneToday: false, totalCheckins: 0, statedGoalLabel: null })
    );
    expect(applicable).toEqual(['daily_reset']);
    expect(applicable).not.toContain('gentle_focus');
  });

  it('is structurally unable to outrank rules 0 through 4', () => {
    const ladder: readonly string[] = PRIORITY_LADDER;
    expect(ladder.indexOf('daily_reset')).toBeGreaterThan(ladder.indexOf('todays_focus'));
    expect(ladder.indexOf('gentle_focus')).toBeGreaterThan(ladder.indexOf('todays_focus'));

    const everything = allRulesApply();
    expect(applicableRules(everything)).toContain('daily_reset');
    expect(selectPriority(everything, TODAY).rule).toBe('re_entry');

    const withoutReEntry = { ...everything, isReEntry: false };
    expect(applicableRules(withoutReEntry)).toContain('daily_reset');
    expect(selectPriority(withoutReEntry, TODAY).rule).toBe('reset_plan_commitment');
  });
});

describe('non-vacuity: every ladder rule can both win and lose', () => {
  /**
   * Strips every rule ABOVE `index` off the all-rules fixture, leaving the
   * rule at `index` as the highest one still applicable.
   *
   * The last two ladder entries are the two halves of a single question
   * (has she done today's Daily Reset), so exactly one of them can ever be
   * applicable at a time. Reaching 'gentle_focus' therefore means flipping
   * that fact rather than removing a rule above it — which is itself the
   * property worth pinning, since it is what guarantees the fallback can
   * only ever produce one card.
   */
  function onlyFrom(index: number): PriorityInputs {
    const inputs: PriorityInputs = { ...allRulesApply(), isReEntry: false };
    if (index > 0) inputs.resetPlan = null;
    if (index > 1) inputs.implicatedDriver = null;
    if (index > 2) inputs.incompleteAction = null;
    if (index > 3) inputs.todaysFocus = null;
    if (PRIORITY_LADDER[index] === 'gentle_focus') {
      inputs.fallback = { ...inputs.fallback, checkinDoneToday: true };
    }
    return inputs;
  }

  it.each(PRIORITY_LADDER.map((rule, index) => [rule, index] as const))(
    '%s wins once the rules above it are gone, and loses while any of them remain',
    (rule, index) => {
      // Wins when it is the highest remaining rule.
      expect(selectPriority(onlyFrom(index), TODAY).rule).toBe(rule);

      // Loses whenever any higher rule is restored — which is only
      // meaningful because the rule was still applicable at the time.
      // 'gentle_focus' sits directly below 'daily_reset', but those two can
      // never be applicable at once, so restoring "the rule above it" has
      // to reach past its own twin to the nearest REAL rule to be a
      // meaningful precedence test at all.
      const higherIndex = PRIORITY_LADDER[index] === 'gentle_focus' ? index - 2 : index - 1;
      if (higherIndex >= 0) {
        const withHigher: PriorityInputs = {
          ...onlyFrom(higherIndex),
          // Keep this rule's own applicability intact while restoring the
          // one above it, so the assertion below is about precedence and
          // not about the rule having quietly become unavailable.
          fallback: onlyFrom(index).fallback,
        };
        expect(applicableRules(withHigher)).toContain(rule);
        expect(selectPriority(withHigher, TODAY).rule).not.toBe(rule);
      }
    }
  );

  it('re-entry beats every single ladder rule taken one at a time', () => {
    for (let index = 0; index < PRIORITY_LADDER.length; index += 1) {
      const inputs = { ...onlyFrom(index), isReEntry: true };
      expect(applicableRules(inputs)).toContain(PRIORITY_LADDER[index]);
      expect(selectPriority(inputs, TODAY).rule).toBe('re_entry');
    }
  });

  it('the two fallback halves are mutually exclusive, so the ladder can never yield two cards', () => {
    const base = allRulesApply();
    const notDone = applicableRules({
      ...base,
      fallback: { ...base.fallback, checkinDoneToday: false },
    });
    const done = applicableRules({
      ...base,
      fallback: { ...base.fallback, checkinDoneToday: true },
    });

    expect(notDone).toContain('daily_reset');
    expect(notDone).not.toContain('gentle_focus');
    expect(done).toContain('gentle_focus');
    expect(done).not.toContain('daily_reset');
  });
});

describe('the one absence ladder — Root Presence and re-entry reconciled', () => {
  it('re-entry needs a real sign-in absence, and 7 is the named threshold', () => {
    expect(RE_ENTRY_MIN_ABSENCE_DAYS).toBe(7);
    // Deliberately more than the greeting's own check-in threshold, which
    // is the whole point of the reconciliation.
    expect(RE_ENTRY_MIN_ABSENCE_DAYS).toBeGreaterThan(RETURN_GREETING_MIN_GAP_DAYS);
  });

  it('fires at the threshold and not one day below it', () => {
    expect(
      isReEntry({ daysSinceLastCheckin: 30, daysSinceLastSignIn: RE_ENTRY_MIN_ABSENCE_DAYS })
    ).toBe(true);
    expect(
      isReEntry({ daysSinceLastCheckin: 30, daysSinceLastSignIn: RE_ENTRY_MIN_ABSENCE_DAYS - 1 })
    ).toBe(false);
  });

  it('never fires for a member with no earlier sign-in, since there is no absence to return from', () => {
    expect(isReEntry({ daysSinceLastCheckin: 60, daysSinceLastSignIn: null })).toBe(false);
  });

  it('escalates the SAME episode rather than competing with the greeting', () => {
    // A 14-day absence also satisfies the greeting's own check-in gap. One
    // state comes back, not two, and it is the stronger one.
    const state = classifyPresence({ daysSinceLastCheckin: 14, daysSinceLastSignIn: 14 });
    expect(state).toBe('re_entry');
  });

  it('leaves the existing greeting behavior untouched below the re-entry threshold', () => {
    // Signed in yesterday, but has not checked in for 4 days: Root Presence
    // greets exactly as it did before this build, and the ladder still runs.
    expect(classifyPresence({ daysSinceLastCheckin: 4, daysSinceLastSignIn: 1 })).toBe(
      'return_greeting'
    );
    expect(classifyPresence({ daysSinceLastCheckin: 1, daysSinceLastSignIn: 1 })).toBe('present');
  });

  it('a returning member is greeted with Root Presence own sentence, not a second welcome', () => {
    // The card's welcome line is asserted to be the existing constant in
    // tests/priority-card-copy.test.ts; this pins that the constant is the
    // one the Root Presence System already owns.
    expect(RETURN_GREETING_TEXT).toBe("I'm glad you're back.");
  });
});
