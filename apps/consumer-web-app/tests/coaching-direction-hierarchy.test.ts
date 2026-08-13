/**
 * Adaptive Coaching Direction — guard tests for the decision hierarchy and
 * the adaptation guardrails.
 *
 * Same discipline as tests/priority-hierarchy.test.ts, and for the same
 * reason: precedence tests are the easiest kind of test to write
 * vacuously. Every precedence test below starts from ONE fixture in which
 * every rule applies at once, removes only the rules above the one under
 * test, and uses `applicableRules` to assert in the test itself that the
 * losing rules really were available and really did lose.
 *
 * Two of these tests were proven by breaking the code and watching them
 * fail. See the notes on `movement is blocked from emission` and
 * `escalates after two approach changes with no response`.
 */

import { describe, it, expect } from 'vitest';
import {
  NO_ADAPTATION,
  applicableRules,
  driverActionType,
  selectCoachingAction,
  selectPriority,
  type AdaptationContext,
} from '@/lib/priority/select';
import { PRIORITY_LADDER, PRIORITY_OVERRIDES, type PriorityInputs } from '@/lib/priority/types';
import {
  APPROACH_AS_WRITTEN,
  APPROACH_REFRAMED,
  APPROACH_SMALLER,
  CHANGES_BEFORE_ESCALATION,
  ESCALATION_REASON_NO_RESPONSE,
  IGNORES_BEFORE_APPROACH_CHANGE,
  adaptThread,
  threadCountersAfterResponse,
  threadKeyFor,
} from '@/lib/coaching-direction/adaptation';
import {
  BLOCKED_ACTION_TYPES,
  COACHING_ACTION_TYPES,
  MEMBER_RESPONSES,
  isEmittableActionType,
  type CoachingThreadState,
} from '@/lib/coaching-direction/types';
import {
  APPROACH_REFRAMED_HELP_TEXT,
  APPROACH_SMALLER_HELP_TEXT,
  SAFETY_HELP_TEXT,
  SAFETY_PRIORITY_TEXT,
} from '@/lib/priority/copy';

const TODAY = '2026-08-12';

/** Every rule applies at once, including both overrides. Tests strip rules OFF this. */
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
      driverId: 'SLP-3',
      domainKey: 'SLP',
      label: 'Bedtime consistency',
      whatItObserves: 'How much bedtime varies night to night',
      findingSentence:
        'On nights you get to bed at a steadier time, your next-day energy tends to be higher.',
    },
    qualifiedPattern: {
      pairKey: 'sleep_hours::next_day_energy',
      label: 'Sleep hours and next-day energy',
      memberSentence:
        'This has held across several weeks now: longer nights tend to be followed by steadier days.',
      confidence: 0.82,
      observationCount: 24,
    },
    incompleteAction: {
      key: 'wbsa',
      name: 'Whole-Body Systems Assessment',
      href: '/assessment/wbsa',
      resumeHint: 'Your answers so far are saved.',
      lastTouchedLocalDate: '2026-08-05',
    },
    behavioralFriction: {
      kind: 'daily_reset_incomplete',
      signalType: 'repeated_incomplete_flow',
      starts: 5,
      completions: 1,
      completionRate: 20,
      savedCount: null,
      windowDays: null,
      evidenceSufficiency: 'moderate',
    },
    todaysFocus: {
      feedItemId: 'feed-1',
      focusText: 'Notice where your energy actually goes today.',
      reasonText: 'Your last few check-ins pointed at afternoons.',
      suggestedAction: 'Take one short walk after lunch.',
    },
    fallback: { checkinDoneToday: false, totalCheckins: 12, statedGoalLabel: 'Sleep better' },
    hasRealHistory: true,
  };
}

/** Removes the overrides, so the ladder is what is being tested. */
function ladderOnly(): PriorityInputs {
  return { ...everythingApplies(), safetyFlag: null, isReEntry: false };
}

/** Strips every ladder rule ABOVE `index`, leaving that rule the highest applicable one. */
function onlyFrom(index: number): PriorityInputs {
  const inputs = ladderOnly();
  if (index > 0) inputs.resetPlan = null;
  if (index > 1) inputs.implicatedDriver = null;
  if (index > 2) inputs.qualifiedPattern = null;
  if (index > 3) inputs.incompleteAction = null;
  if (index > 4) inputs.behavioralFriction = null;
  if (index > 5) inputs.todaysFocus = null;
  if (PRIORITY_LADDER[index] === 'gentle_focus') {
    inputs.fallback = { ...inputs.fallback, checkinDoneToday: true };
  }
  return inputs;
}

function thread(overrides: Partial<CoachingThreadState> = {}): CoachingThreadState {
  return {
    threadKey: 'reset_plan_commitment::plan-1',
    rule: 'reset_plan_commitment',
    actionType: 'reset',
    approach: APPROACH_AS_WRITTEN,
    approachChanges: 0,
    consecutiveIgnored: 0,
    responsesSinceLastChange: 0,
    firstSelectedLocalDate: '2026-08-01',
    lastSelectedLocalDate: '2026-08-11',
    coachEscalatedAt: null,
    coachEscalationReason: null,
    escalationCooldownUntil: null,
    ...overrides,
  };
}

function withThreads(...threads: CoachingThreadState[]): AdaptationContext {
  return {
    threads: new Map(threads.map((t) => [t.threadKey, t])),
    completedYesterdayThreadKey: null,
  };
}

// =====================================================================
// Exactly one action, always.
// =====================================================================

describe('the engine returns exactly one action', () => {
  it('returns a single object even when every rule applies at once', () => {
    const result = selectCoachingAction(everythingApplies(), TODAY);
    expect(Array.isArray(result.selected)).toBe(false);
    expect(typeof result.selected.rule).toBe('string');
  });

  it('every rule is genuinely available in the fixture, so the precedence tests are not vacuous', () => {
    const available = applicableRules(everythingApplies());
    for (const override of PRIORITY_OVERRIDES) expect(available).toContain(override);

    const realRules = PRIORITY_LADDER.filter(
      (rule) => rule !== 'daily_reset' && rule !== 'gentle_focus'
    );
    for (const rule of realRules) expect(available).toContain(rule);

    const fallbackHalves = available.filter(
      (rule) => rule === 'daily_reset' || rule === 'gentle_focus'
    );
    expect(fallbackHalves).toHaveLength(1);
  });

  it('always returns something, even for a member with no signals at all', () => {
    const nothing: PriorityInputs = {
      safetyFlag: null,
      isReEntry: false,
      resetPlan: null,
      implicatedDriver: null,
      qualifiedPattern: null,
      incompleteAction: null,
      behavioralFriction: null,
      todaysFocus: null,
      fallback: { checkinDoneToday: false, totalCheckins: 0, statedGoalLabel: null },
      hasRealHistory: false,
    };
    const result = selectCoachingAction(nothing, TODAY);
    expect(result.selected.rule).toBe('daily_reset');
    expect(result.selected.title.length).toBeGreaterThan(0);
  });
});

// =====================================================================
// Rule 1 — safety.
// =====================================================================

describe('rule 1 — safety wins over everything, including re-entry', () => {
  it('beats every other rule while all of them are still applicable', () => {
    const inputs = everythingApplies();
    const available = applicableRules(inputs);
    expect(available).toContain('re_entry');
    expect(available).toContain('reset_plan_commitment');
    expect(available).toContain('behavioral_friction');

    expect(selectCoachingAction(inputs, TODAY).selected.rule).toBe('safety');
  });

  it('beats each other rule taken one at a time, so it is precedence and not luck', () => {
    for (let index = 0; index < PRIORITY_LADDER.length; index += 1) {
      const inputs = { ...onlyFrom(index), safetyFlag: { safetyClassificationId: 'cls-1' } };
      expect(applicableRules(inputs)).toContain(PRIORITY_LADDER[index]);
      expect(selectCoachingAction(inputs, TODAY).selected.rule).toBe('safety');
    }
  });

  it('outranks re-entry specifically, since a welcome back would ignore what she raised', () => {
    const inputs = { ...ladderOnly(), isReEntry: true, safetyFlag: { safetyClassificationId: 'c' } };
    expect(applicableRules(inputs)).toContain('re_entry');
    expect(selectCoachingAction(inputs, TODAY).selected.rule).toBe('safety');
  });

  it('stops overriding the moment the flag is gone, handing the screen back to the ladder', () => {
    const inputs = { ...everythingApplies(), safetyFlag: null };
    expect(selectCoachingAction(inputs, TODAY).selected.rule).toBe('re_entry');
  });

  it('says nothing about what she raised: no reason line, and no health content anywhere', () => {
    const result = selectCoachingAction(everythingApplies(), TODAY).selected;
    expect(result.rule).toBe('safety');
    expect(result.reason).toBeNull();
    expect(result.title).toBe(SAFETY_PRIORITY_TEXT);
    expect(result.help).toBe(SAFETY_HELP_TEXT);

    // The evidence carries the row id and a boolean. Nothing else.
    expect(Object.keys(result.evidence).sort()).toEqual([
      'acknowledgmentPending',
      'rule',
      'safetyClassificationId',
    ]);
  });

  it('is typed as reflection, never as something that asks her to do a thing', () => {
    expect(selectCoachingAction(everythingApplies(), TODAY).selected.actionType).toBe('reflection');
  });
});

// =====================================================================
// Rules 2 through 6 — precedence, non-vacuously.
// =====================================================================

describe('every ladder rule can both win and lose', () => {
  it.each(PRIORITY_LADDER.map((rule, index) => [rule, index] as const))(
    '%s wins once the rules above it are gone, and loses while any of them remain',
    (rule, index) => {
      expect(selectCoachingAction(onlyFrom(index), TODAY).selected.rule).toBe(rule);

      // The two fallback halves can never be applicable at once, so
      // "restore the rule above it" has to reach past its own twin to the
      // nearest real rule to be a meaningful precedence test at all.
      const higherIndex = PRIORITY_LADDER[index] === 'gentle_focus' ? index - 2 : index - 1;
      if (higherIndex >= 0) {
        const withHigher: PriorityInputs = {
          ...onlyFrom(higherIndex),
          fallback: onlyFrom(index).fallback,
        };
        expect(applicableRules(withHigher)).toContain(rule);
        expect(selectCoachingAction(withHigher, TODAY).selected.rule).not.toBe(rule);
      }
    }
  );

  it('rule 3, an active commitment, beats every finding and friction rule below it', () => {
    const inputs = ladderOnly();
    expect(applicableRules(inputs)).toEqual([
      'reset_plan_commitment',
      'implicated_driver',
      'qualified_pattern',
      'incomplete_action',
      'behavioral_friction',
      'todays_focus',
      'daily_reset',
    ]);
    expect(selectCoachingAction(inputs, TODAY).selected.rule).toBe('reset_plan_commitment');
  });

  it('rule 4 prefers the implicated driver, and falls to the tier 3 pattern when there is none', () => {
    const withDriver = { ...ladderOnly(), resetPlan: null };
    expect(selectCoachingAction(withDriver, TODAY).selected.rule).toBe('implicated_driver');

    const withoutDriver = { ...withDriver, implicatedDriver: null };
    expect(applicableRules(withoutDriver)).toContain('qualified_pattern');
    expect(selectCoachingAction(withoutDriver, TODAY).selected.rule).toBe('qualified_pattern');
  });

  it("rule 4's tier 3 pattern shows the correlation engine's own sentence, never a rewording", () => {
    const inputs = { ...ladderOnly(), resetPlan: null, implicatedDriver: null };
    const result = selectCoachingAction(inputs, TODAY).selected;
    expect(result.reason).toBe(inputs.qualifiedPattern!.memberSentence);
  });

  it('rule 5 offers an easier version of the stuck behavior, with a query-backed reason', () => {
    const inputs = onlyFrom(PRIORITY_LADDER.indexOf('behavioral_friction'));
    const result = selectCoachingAction(inputs, TODAY).selected;

    expect(result.rule).toBe('behavioral_friction');
    expect(result.actionType).toBe('reset');
    expect(result.href).toBe('/checkin');
    expect(result.reason).not.toBeNull();
    // Never a scoreboard, even though the counts are right there.
    expect(result.reason).not.toMatch(/\d/);
    expect(result.title.toLowerCase()).not.toContain('you should');
  });

  it('rule 6, the fallback, is unchanged and still always available', () => {
    const inputs = onlyFrom(PRIORITY_LADDER.indexOf('daily_reset'));
    expect(applicableRules(inputs)).toEqual(['daily_reset']);
    expect(selectCoachingAction(inputs, TODAY).selected.rule).toBe('daily_reset');
    expect(selectCoachingAction(inputs, TODAY).selected.href).toBe('/checkin');
  });
});

// =====================================================================
// The movement block.
// =====================================================================

describe('movement is blocked from emission', () => {
  /**
   * PROVEN BY BREAKING IT. With `BLOCKED_ACTION_TYPES` emptied in
   * lib/coaching-direction/types.ts, the first test below failed with
   * "expected 'movement' not to be 'movement'" and the second failed with
   * "expected 'implicated_driver' to be 'qualified_pattern'". Restored
   * immediately afterwards.
   */
  it('names movement as a real action type in the schema, and as a blocked one', () => {
    expect(COACHING_ACTION_TYPES).toContain('movement');
    expect(BLOCKED_ACTION_TYPES).toEqual(['movement']);
    expect(isEmittableActionType('movement')).toBe(false);
    for (const type of COACHING_ACTION_TYPES.filter((t) => t !== 'movement')) {
      expect(isEmittableActionType(type)).toBe(true);
    }
  });

  it('a movement-domain driver genuinely produces a movement action type', () => {
    // Non-vacuity: the blocked candidate has to be really constructible,
    // or the block below proves nothing.
    expect(driverActionType('MOV')).toBe('movement');
    expect(driverActionType('FUE')).toBe('nutrition');
    expect(driverActionType('SLP')).toBe('reflection');
  });

  it('drops that candidate and carries on down the ladder rather than emitting it', () => {
    const inputs: PriorityInputs = {
      ...ladderOnly(),
      resetPlan: null,
      implicatedDriver: {
        driverId: 'MOV-2',
        domainKey: 'MOV',
        label: 'Daily step volume',
        whatItObserves: 'How much walking a day contains',
        findingSentence: 'On days you move more, your evenings tend to settle sooner.',
      },
    };

    // The movement candidate really was the highest applicable rule.
    expect(applicableRules(inputs)[0]).toBe('implicated_driver');

    const result = selectCoachingAction(inputs, TODAY).selected;
    expect(result.rule).toBe('qualified_pattern');
    expect(result.actionType).not.toBe('movement');
  });

  it('never emits a movement action from any input combination the ladder can produce', () => {
    for (let index = 0; index < PRIORITY_LADDER.length; index += 1) {
      const inputs: PriorityInputs = {
        ...onlyFrom(index),
        implicatedDriver: onlyFrom(index).implicatedDriver
          ? { ...onlyFrom(index).implicatedDriver!, domainKey: 'MOV' }
          : null,
      };
      expect(selectCoachingAction(inputs, TODAY).selected.actionType).not.toBe('movement');
    }
  });
});

// =====================================================================
// Guardrail 1 — three ignored days changes the approach.
// =====================================================================

describe('a priority ignored three days running changes approach', () => {
  const key = threadKeyFor('reset_plan_commitment', 'plan-1');

  it('leaves the framing alone below the threshold', () => {
    for (let ignored = 0; ignored < IGNORES_BEFORE_APPROACH_CHANGE; ignored += 1) {
      const outcome = adaptThread(thread({ consecutiveIgnored: ignored }), TODAY);
      expect(outcome.changed).toBe(false);
      expect(outcome.approach).toBe(APPROACH_AS_WRITTEN);
    }
  });

  it('changes the framing exactly at the third consecutive ignored day', () => {
    const outcome = adaptThread(
      thread({ consecutiveIgnored: IGNORES_BEFORE_APPROACH_CHANGE }),
      TODAY
    );
    expect(outcome.changed).toBe(true);
    expect(outcome.approach).toBe(APPROACH_SMALLER);
    expect(outcome.escalate).toBe(false);
  });

  it('shows her the smaller step as the priority itself, made of words the rule already wrote', () => {
    const inputs = ladderOnly();
    const asWritten = selectCoachingAction(inputs, TODAY).selected;

    const adapted = selectCoachingAction(
      inputs,
      TODAY,
      withThreads(thread({ threadKey: key, consecutiveIgnored: 3 }))
    );

    expect(adapted.selected.rule).toBe('reset_plan_commitment');
    expect(adapted.selected.approach).toBe(APPROACH_SMALLER);
    expect(adapted.selected.title).toBe(asWritten.help);
    expect(adapted.selected.help).toBe(APPROACH_SMALLER_HELP_TEXT);
    expect(adapted.threadChanges).toEqual([
      { threadKey: key, kind: 'approach_change', approach: APPROACH_SMALLER },
    ]);
  });

  it('changes again after three more ignored days, and reframes rather than repeating', () => {
    const inputs = ladderOnly();
    const adapted = selectCoachingAction(
      inputs,
      TODAY,
      withThreads(
        thread({
          threadKey: key,
          approach: APPROACH_SMALLER,
          approachChanges: 1,
          consecutiveIgnored: 3,
          // She responded to the first change, so the second one is not an
          // escalation.
          responsesSinceLastChange: 1,
        })
      )
    );

    expect(adapted.selected.approach).toBe(APPROACH_REFRAMED);
    expect(adapted.selected.help).toBe(APPROACH_REFRAMED_HELP_TEXT);
    // The reframe drops the reason: at this point Root is no longer sure it
    // should have raised this at all.
    expect(adapted.selected.reason).toBeNull();
  });

  it('the reframe never names a count, a streak or a missed day', () => {
    const text = APPROACH_REFRAMED_HELP_TEXT.toLowerCase();
    for (const banned of ['missed', 'streak', 'behind', 'overdue', 'again and again']) {
      expect(text).not.toContain(banned);
    }
    expect(text).not.toMatch(/\d/);
    expect(APPROACH_REFRAMED_HELP_TEXT).not.toContain('—');
  });

  it('a real response clears the streak, so an ordinary quiet day never triggers a change', () => {
    const responded = threadCountersAfterResponse(thread({ consecutiveIgnored: 2 }), 'done');
    expect(responded.consecutiveIgnored).toBe(0);

    const ignoredAgain = threadCountersAfterResponse(thread({ consecutiveIgnored: 2 }), 'ignored');
    expect(ignoredAgain.consecutiveIgnored).toBe(3);
  });

  it('a day she never opened the app is inert in both directions', () => {
    const before = thread({ consecutiveIgnored: 2, responsesSinceLastChange: 1 });
    const after = threadCountersAfterResponse(before, 'not_seen');
    expect(after.consecutiveIgnored).toBe(2);
    expect(after.responsesSinceLastChange).toBe(1);
  });
});

// =====================================================================
// Guardrail 2 — two changes with no response escalates.
// =====================================================================

describe('two approach changes with no response escalates to a coach', () => {
  const key = threadKeyFor('reset_plan_commitment', 'plan-1');

  /**
   * PROVEN BY BREAKING IT. With the escalation condition in
   * lib/coaching-direction/adaptation.ts changed from
   * `changes >= CHANGES_BEFORE_ESCALATION` to `changes >= 3`, the first
   * two tests below failed with "expected false to be true" and "expected
   * 'reset_plan_commitment' to be 'implicated_driver'". Restored
   * immediately afterwards.
   */
  it('escalates on the second change when nothing in between counted as a response', () => {
    const outcome = adaptThread(
      thread({
        approach: APPROACH_SMALLER,
        approachChanges: CHANGES_BEFORE_ESCALATION - 1,
        consecutiveIgnored: IGNORES_BEFORE_APPROACH_CHANGE,
        responsesSinceLastChange: 0,
      }),
      TODAY
    );
    expect(outcome.escalate).toBe(true);
    expect(outcome.blocked).toBe(true);
  });

  it('stops selecting the thread and takes the next best priority instead', () => {
    const inputs = ladderOnly();
    const result = selectCoachingAction(
      inputs,
      TODAY,
      withThreads(
        thread({
          threadKey: key,
          approach: APPROACH_SMALLER,
          approachChanges: 1,
          consecutiveIgnored: 3,
          responsesSinceLastChange: 0,
        })
      )
    );

    // The escalated rule really was the highest applicable one.
    expect(applicableRules(inputs)[0]).toBe('reset_plan_commitment');
    expect(result.selected.rule).toBe('implicated_driver');
    expect(result.threadChanges).toEqual([
      {
        threadKey: key,
        kind: 'escalate',
        approach: APPROACH_REFRAMED,
        reason: ESCALATION_REASON_NO_RESPONSE,
        // Part 3 carries the action type on the escalate change, so the
        // escalation's own analytics event can say which KIND of thing
        // stopped landing without the service looking the thread back up.
        actionType: 'reset',
      },
    ]);
  });

  it('never selects an already-escalated thread again, and raises no second alert', () => {
    const inputs = ladderOnly();
    const result = selectCoachingAction(
      inputs,
      TODAY,
      withThreads(
        thread({ threadKey: key, coachEscalatedAt: '2026-08-10T12:00:00.000Z' })
      )
    );
    expect(result.selected.rule).toBe('implicated_driver');
    expect(result.threadChanges).toEqual([]);
  });

  it('does NOT escalate when she responded between the two changes', () => {
    const outcome = adaptThread(
      thread({
        approach: APPROACH_SMALLER,
        approachChanges: 1,
        consecutiveIgnored: 3,
        responsesSinceLastChange: 2,
      }),
      TODAY
    );
    expect(outcome.escalate).toBe(false);
    expect(outcome.blocked).toBe(false);
    expect(outcome.approach).toBe(APPROACH_REFRAMED);
  });

  it('setting something aside counts as a response, so a busy member is never escalated', () => {
    const after = threadCountersAfterResponse(thread({ responsesSinceLastChange: 0 }), 'later');
    expect(after.responsesSinceLastChange).toBe(1);
    expect(after.consecutiveIgnored).toBe(0);
  });
});

// =====================================================================
// Guardrail 3 — follow on from what she finished.
// =====================================================================

describe('a completed action yesterday is preferred over an unrelated one today', () => {
  it('promotes the thread she finished, when the hierarchy still admits it', () => {
    const inputs = { ...ladderOnly(), resetPlan: null };
    // Without the follow-on, rule 4's driver wins.
    expect(selectCoachingAction(inputs, TODAY).selected.rule).toBe('implicated_driver');

    const result = selectCoachingAction(inputs, TODAY, {
      threads: new Map(),
      completedYesterdayThreadKey: threadKeyFor('behavioral_friction', 'daily_reset_incomplete'),
    });

    expect(result.selected.rule).toBe('behavioral_friction');
    expect(result.isFollowOn).toBe(true);
  });

  it('cannot resurrect a rule whose inputs are absent today', () => {
    const inputs = { ...ladderOnly(), resetPlan: null };
    const result = selectCoachingAction(inputs, TODAY, {
      threads: new Map(),
      completedYesterdayThreadKey: threadKeyFor('reset_plan_commitment', 'plan-1'),
    });
    expect(result.selected.rule).toBe('implicated_driver');
    expect(result.isFollowOn).toBe(false);
  });

  it('cannot outrank the safety override', () => {
    const result = selectCoachingAction(everythingApplies(), TODAY, {
      threads: new Map(),
      completedYesterdayThreadKey: threadKeyFor('todays_focus', 'feed-1'),
    });
    expect(result.selected.rule).toBe('safety');
    expect(result.isFollowOn).toBe(false);
  });

  it('does not fire when she merely set it aside, only when she finished it', () => {
    // The context is built by the service from a 'done' response only; this
    // pins that a null key changes nothing at all.
    const inputs = { ...ladderOnly(), resetPlan: null };
    expect(selectCoachingAction(inputs, TODAY, NO_ADAPTATION).selected.rule).toBe(
      'implicated_driver'
    );
  });
});

// =====================================================================
// The vocabulary itself.
// =====================================================================

describe('the vocabulary is closed and matches the schema', () => {
  it('declares exactly the five action types the brief names', () => {
    expect([...COACHING_ACTION_TYPES]).toEqual([
      'reset',
      'nutrition',
      'movement',
      'reflection',
      'reconnect',
    ]);
  });

  it('declares exactly the five member responses, keeping ignored and not seen distinct', () => {
    expect([...MEMBER_RESPONSES]).toEqual(['done', 'help', 'later', 'ignored', 'not_seen']);
  });

  it('gives every rule an action type, and never leaves one undefined', () => {
    for (let index = 0; index < PRIORITY_LADDER.length; index += 1) {
      const selected = selectCoachingAction(onlyFrom(index), TODAY).selected;
      expect(COACHING_ACTION_TYPES).toContain(selected.actionType);
    }
    expect(selectCoachingAction(everythingApplies(), TODAY).selected.actionType).toBe('reflection');
    const reEntry = { ...everythingApplies(), safetyFlag: null };
    expect(selectCoachingAction(reEntry, TODAY).selected.actionType).toBe('reconnect');
  });

  it('gives every decision a thread key built from its own rule and item', () => {
    const selected = selectCoachingAction(ladderOnly(), TODAY).selected;
    expect(selected.threadKey).toBe('reset_plan_commitment::plan-1');

    const keyless = selectCoachingAction(
      onlyFrom(PRIORITY_LADDER.indexOf('daily_reset')),
      TODAY
    ).selected;
    expect(keyless.threadKey).toBe('daily_reset::-');
  });

  it('the un-adapted entry point still behaves exactly as it always did', () => {
    expect(selectPriority(ladderOnly(), TODAY).rule).toBe('reset_plan_commitment');
    expect(selectPriority(ladderOnly(), TODAY).approach).toBe(APPROACH_AS_WRITTEN);
  });
});
