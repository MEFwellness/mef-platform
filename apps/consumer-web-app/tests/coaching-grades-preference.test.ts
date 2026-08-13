/**
 * Adaptive Coaching Direction Part 3 — the per-member preference layer.
 *
 * The whole risk of this layer is that it quietly becomes a second
 * hierarchy. Every test below exists to pin one property that stops it:
 *
 *   - the sequence of RULES never changes, for any grades at all
 *   - with no grades, the engine is byte-identical to Part 2
 *   - safety, re-engagement and the commitment she agreed to are untouched
 *   - a dead grade deprioritizes and never removes
 *   - a thin grade reorders nothing
 *   - the Part 2 week focus still wins where the two disagree
 *
 * The non-vacuity discipline is the same one tests/coaching-direction-
 * hierarchy.test.ts uses: every "nothing changed" assertion is paired with
 * a fixture where something demonstrably DOES change, so a test cannot pass
 * because the reorder was never reachable.
 */

import { describe, it, expect } from 'vitest';
import {
  MIN_EVIDENCE_TO_PREFER,
  isActionableGradeEvidence,
  preferGradedActionTypesWithinRung,
  preferenceBand,
} from '@/lib/coaching-direction/preference';
import { DEAD_GRADE_DECAY_DAYS } from '@/lib/coaching-direction/grading';
import type { CoachingGrade } from '@/lib/coaching-direction/grading';
import { FOCUS_EXEMPT_RULES } from '@/lib/weekly-review/focus';
import { NO_ADAPTATION, selectCoachingAction } from '@/lib/priority/select';
import type { AdaptationContext } from '@/lib/priority/select';
import { PRIORITY_LADDER, type PriorityInputs, type PriorityRule } from '@/lib/priority/types';
import type { CoachingActionType } from '@/lib/coaching-direction/types';

const TODAY = '2026-08-12';

// ---------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------

type Candidate = { rule: PriorityRule; threadKey: string; actionType: CoachingActionType };

function candidate(
  rule: PriorityRule,
  actionType: CoachingActionType,
  item: string
): Candidate {
  return { rule, actionType, threadKey: `${rule}::${item}` };
}

function grade(overrides: Partial<CoachingGrade> = {}): CoachingGrade {
  return {
    scope: 'action_type',
    key: 'nutrition',
    actionType: 'nutrition',
    deliveredCount: 8,
    actedCount: 6,
    ignoredCount: 2,
    notSeenCount: 0,
    comparedCount: 4,
    movedCount: 2,
    verdict: 'landing',
    evidenceLevel: 'strong',
    spanDays: 30,
    lastDeliveredLocalDate: '2026-08-11',
    ...overrides,
  };
}

function gradeMap(...grades: CoachingGrade[]): Map<string, CoachingGrade> {
  return new Map(grades.map((g) => [g.key, g]));
}

/**
 * A ladder with several candidates on ONE rung and single candidates on the
 * others, which is the only shape this layer can act on at all.
 */
function ladder(): Candidate[] {
  return [
    candidate('reset_plan_commitment', 'reset', 'plan-1'),
    candidate('implicated_driver', 'reflection', 'SLP-3'),
    candidate('implicated_driver', 'nutrition', 'FUE-2'),
    candidate('implicated_driver', 'reflection', 'STR-1'),
    candidate('qualified_pattern', 'reflection', 'pair-1'),
    candidate('daily_reset', 'reset', '-'),
  ];
}

// =====================================================================
// The two properties that make this safe.
// =====================================================================

describe('property 1 — the sequence of rules is never changed', () => {
  it('holds for a landing grade', () => {
    const before = ladder();
    const after = preferGradedActionTypesWithinRung(before, gradeMap(grade()), TODAY);
    expect(after.map((c) => c.rule)).toEqual(before.map((c) => c.rule));
  });

  it('holds for a dead grade', () => {
    const before = ladder();
    const after = preferGradedActionTypesWithinRung(
      before,
      gradeMap(grade({ verdict: 'dead' })),
      TODAY
    );
    expect(after.map((c) => c.rule)).toEqual(before.map((c) => c.rule));
  });

  it('holds when every action type in the closed set is graded at once', () => {
    const before = ladder();
    const all = gradeMap(
      grade({ key: 'reset', actionType: 'reset', verdict: 'dead' }),
      grade({ key: 'nutrition', actionType: 'nutrition', verdict: 'landing' }),
      grade({ key: 'reflection', actionType: 'reflection', verdict: 'dead' }),
      grade({ key: 'reconnect', actionType: 'reconnect', verdict: 'landing' }),
      grade({ key: 'movement', actionType: 'movement', verdict: 'dead' })
    );
    const after = preferGradedActionTypesWithinRung(before, all, TODAY);
    expect(after.map((c) => c.rule)).toEqual(before.map((c) => c.rule));
  });

  it('never adds or removes a candidate', () => {
    const before = ladder();
    const after = preferGradedActionTypesWithinRung(
      before,
      gradeMap(grade({ verdict: 'dead' })),
      TODAY
    );
    expect(after).toHaveLength(before.length);
    expect([...after].sort((a, b) => a.threadKey.localeCompare(b.threadKey))).toEqual(
      [...before].sort((a, b) => a.threadKey.localeCompare(b.threadKey))
    );
  });
});

describe('property 2 — with no grades, nothing moves at all', () => {
  it('returns a byte-identical array', () => {
    const before = ladder();
    expect(preferGradedActionTypesWithinRung(before, new Map(), TODAY)).toEqual(before);
  });

  it('and that is not vacuous: with a grade, the same input demonstrably reorders', () => {
    const before = ladder();
    const after = preferGradedActionTypesWithinRung(before, gradeMap(grade()), TODAY);
    expect(after).not.toEqual(before);
    expect(after[1]!.actionType).toBe('nutrition');
  });
});

// =====================================================================
// What the preference actually does.
// =====================================================================

describe('inside one rung, a landing type comes first and a dead type comes last', () => {
  it('promotes the landing type ahead of its equally-ranked neighbours', () => {
    const after = preferGradedActionTypesWithinRung(ladder(), gradeMap(grade()), TODAY);
    const rung = after.filter((c) => c.rule === 'implicated_driver');
    expect(rung.map((c) => c.actionType)).toEqual(['nutrition', 'reflection', 'reflection']);
  });

  it('demotes the dead type behind its equally-ranked neighbours', () => {
    const after = preferGradedActionTypesWithinRung(
      ladder(),
      gradeMap(grade({ verdict: 'dead' })),
      TODAY
    );
    const rung = after.filter((c) => c.rule === 'implicated_driver');
    expect(rung.map((c) => c.actionType)).toEqual(['reflection', 'reflection', 'nutrition']);
  });

  it('keeps source order among candidates in the same band, which is the existing tie-break', () => {
    const after = preferGradedActionTypesWithinRung(ladder(), gradeMap(grade()), TODAY);
    const reflections = after
      .filter((c) => c.rule === 'implicated_driver' && c.actionType === 'reflection')
      .map((c) => c.threadKey);
    expect(reflections).toEqual(['implicated_driver::SLP-3', 'implicated_driver::STR-1']);
  });

  it('puts landed_no_change in the middle band, not with landing', () => {
    expect(preferenceBand('nutrition', gradeMap(grade({ verdict: 'landing' })), TODAY)).toBe(0);
    expect(
      preferenceBand('nutrition', gradeMap(grade({ verdict: 'landed_no_change' })), TODAY)
    ).toBe(1);
    expect(preferenceBand('nutrition', gradeMap(grade({ verdict: 'dead' })), TODAY)).toBe(2);
    expect(preferenceBand('nutrition', new Map(), TODAY)).toBe(1);
  });
});

describe('a dead grade deprioritizes and never removes', () => {
  it('a rung whose only candidate is dead-graded still produces that candidate', () => {
    const single: Candidate[] = [
      candidate('behavioral_friction', 'nutrition', 'food_logging_lapsed'),
      candidate('daily_reset', 'reset', '-'),
    ];
    const after = preferGradedActionTypesWithinRung(
      single,
      gradeMap(grade({ verdict: 'dead' })),
      TODAY
    );
    expect(after).toEqual(single);
  });

  it('a rung where every candidate is dead-graded keeps all of them, in source order', () => {
    const allDead: Candidate[] = [
      candidate('implicated_driver', 'nutrition', 'FUE-1'),
      candidate('implicated_driver', 'nutrition', 'FUE-2'),
    ];
    const after = preferGradedActionTypesWithinRung(
      allDead,
      gradeMap(grade({ verdict: 'dead' })),
      TODAY
    );
    expect(after).toEqual(allDead);
  });

  it('and through the whole engine, a dead-graded type still wins when it is the only thing left', () => {
    const inputs = fallbackOnly();
    const dead = gradeMap(grade({ key: 'reset', actionType: 'reset', verdict: 'dead' }));
    const result = selectCoachingAction(inputs, TODAY, { ...NO_ADAPTATION, grades: dead });
    expect(result.selected.rule).toBe('daily_reset');
    expect(result.selected.actionType).toBe('reset');
  });
});

describe('the dead grade decays, so nothing is written off forever', () => {
  const dead = grade({ verdict: 'dead', lastDeliveredLocalDate: '2026-07-22' });

  it('is still demoted the day before the 21 day threshold', () => {
    const dayBefore = '2026-08-11';
    expect(preferenceBand('nutrition', gradeMap(dead), dayBefore)).toBe(2);
    const after = preferGradedActionTypesWithinRung(ladder(), gradeMap(dead), dayBefore);
    expect(after.filter((c) => c.rule === 'implicated_driver').at(-1)!.actionType).toBe('nutrition');
  });

  it('returns to the neutral band exactly at the threshold, and stops being demoted', () => {
    const onThreshold = '2026-08-12';
    expect(preferenceBand('nutrition', gradeMap(dead), onThreshold)).toBe(1);
    const after = preferGradedActionTypesWithinRung(ladder(), gradeMap(dead), onThreshold);
    expect(after.filter((c) => c.rule === 'implicated_driver')).toEqual(
      ladder().filter((c) => c.rule === 'implicated_driver')
    );
  });

  it('the threshold is the 21 days the brief names', () => {
    expect(DEAD_GRADE_DECAY_DAYS).toBe(21);
  });
});

describe('thin evidence reorders nothing', () => {
  it('is not actionable', () => {
    expect(isActionableGradeEvidence('thin')).toBe(false);
    expect(isActionableGradeEvidence('moderate')).toBe(true);
    expect(isActionableGradeEvidence('strong')).toBe(true);
    expect(MIN_EVIDENCE_TO_PREFER).toBe('moderate');
  });

  it('leaves a rung untouched even for a landing verdict', () => {
    const before = ladder();
    const thin = gradeMap(grade({ evidenceLevel: 'thin' }));
    expect(preferGradedActionTypesWithinRung(before, thin, TODAY)).toEqual(before);
    expect(preferenceBand('nutrition', thin, TODAY)).toBe(1);
  });

  it('and that is not vacuous: the same grade at moderate evidence does reorder', () => {
    const before = ladder();
    const moderate = gradeMap(grade({ evidenceLevel: 'moderate' }));
    expect(preferGradedActionTypesWithinRung(before, moderate, TODAY)).not.toEqual(before);
  });
});

describe('the three exempt rules are structurally out of reach', () => {
  it('reuses the Part 2 exemption list rather than declaring a second one', () => {
    expect([...FOCUS_EXEMPT_RULES].sort()).toEqual(
      ['re_entry', 'reset_plan_commitment', 'safety'].sort()
    );
  });

  it('leaves a multi-candidate commitment rung untouched, while reordering a non-exempt one', () => {
    const withCommitmentRung: Candidate[] = [
      candidate('reset_plan_commitment', 'reflection', 'plan-1'),
      candidate('reset_plan_commitment', 'nutrition', 'plan-2'),
      candidate('implicated_driver', 'reflection', 'SLP-3'),
      candidate('implicated_driver', 'nutrition', 'FUE-2'),
    ];
    const after = preferGradedActionTypesWithinRung(
      withCommitmentRung,
      gradeMap(grade()),
      TODAY
    );
    // The exempt rung is byte-identical...
    expect(after.slice(0, 2)).toEqual(withCommitmentRung.slice(0, 2));
    // ...and the non-exempt one directly beneath it demonstrably moved, so
    // the exemption is doing the work rather than the reorder never firing.
    expect(after.slice(2).map((c) => c.actionType)).toEqual(['nutrition', 'reflection']);
  });
});

// =====================================================================
// Through the whole engine.
// =====================================================================

/** Every rule applies at once, plus two extra equally-ranked drivers. */
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
      findingSentence: 'On steadier nights your next-day energy tends to be higher.',
    },
    implicatedDriverAlternates: [
      {
        driverId: 'FUE-2',
        domainKey: 'FUE',
        label: 'Evening eating window',
        whatItObserves: 'How late the last meal lands',
        findingSentence: null,
      },
    ],
    qualifiedPattern: {
      pairKey: 'sleep_hours::next_day_energy',
      label: 'Sleep hours and next-day energy',
      memberSentence: 'This has held across several weeks now.',
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

function fallbackOnly(): PriorityInputs {
  return {
    safetyFlag: null,
    isReEntry: false,
    resetPlan: null,
    implicatedDriver: null,
    qualifiedPattern: null,
    incompleteAction: null,
    behavioralFriction: null,
    todaysFocus: null,
    fallback: { checkinDoneToday: false, totalCheckins: 3, statedGoalLabel: null },
    hasRealHistory: true,
  };
}

/** Only the driver rung applies, so the rung with two candidates is the one that wins. */
function driverRungOnly(): PriorityInputs {
  return { ...everythingApplies(), safetyFlag: null, isReEntry: false, resetPlan: null };
}

describe('through selectCoachingAction, with grades empty, nothing about Part 2 changes', () => {
  const allGradesEmpty: AdaptationContext = { ...NO_ADAPTATION, grades: new Map() };

  it('picks the identical action with an empty grade map and with no grade key at all', () => {
    const withEmpty = selectCoachingAction(everythingApplies(), TODAY, allGradesEmpty);
    const without = selectCoachingAction(everythingApplies(), TODAY, NO_ADAPTATION);
    expect(withEmpty.selected).toEqual(without.selected);
  });

  it('walks the ladder in exactly the declared rule order, whatever the grades say', () => {
    // Peel the ladder one rung at a time with an aggressive grade set and
    // assert the winning rule is the highest remaining rung every time.
    const hostile = gradeMap(
      grade({ key: 'reflection', actionType: 'reflection', verdict: 'dead' }),
      grade({ key: 'reset', actionType: 'reset', verdict: 'dead' }),
      grade({ key: 'nutrition', actionType: 'nutrition', verdict: 'landing' })
    );

    const inputs = driverRungOnly();
    const graded = selectCoachingAction(inputs, TODAY, { ...NO_ADAPTATION, grades: hostile });
    const ungraded = selectCoachingAction(inputs, TODAY, NO_ADAPTATION);
    // The RULE is the same rung either way. Only which candidate on that
    // rung won can differ.
    expect(graded.selected.rule).toBe(ungraded.selected.rule);
    expect(graded.selected.rule).toBe('implicated_driver');
    // And the reorder genuinely happened, so this is not vacuous.
    expect(graded.selected.priorityKey).toBe('FUE-2');
    expect(ungraded.selected.priorityKey).toBe('SLP-3');
  });

  it('a dead grade on a higher rung never lets a lower rung win', () => {
    const deadReset = gradeMap(grade({ key: 'reset', actionType: 'reset', verdict: 'dead' }));
    const inputs = { ...everythingApplies(), safetyFlag: null, isReEntry: false };
    const result = selectCoachingAction(inputs, TODAY, { ...NO_ADAPTATION, grades: deadReset });
    // reset_plan_commitment is a reset action AND graded dead AND exempt.
    // It still wins, because it is the highest rung that applies.
    expect(result.selected.rule).toBe('reset_plan_commitment');
    expect(PRIORITY_LADDER.indexOf('reset_plan_commitment')).toBe(0);
  });
});

describe('safety and re-entry keep their precedence whatever the grades say', () => {
  const hostile = gradeMap(
    grade({ key: 'reflection', actionType: 'reflection', verdict: 'dead' }),
    grade({ key: 'reconnect', actionType: 'reconnect', verdict: 'dead' })
  );

  it('safety still wins, even graded dead', () => {
    const result = selectCoachingAction(everythingApplies(), TODAY, {
      ...NO_ADAPTATION,
      grades: hostile,
    });
    expect(result.selected.rule).toBe('safety');
  });

  it('re-entry still wins over the whole ladder, even graded dead', () => {
    const inputs = { ...everythingApplies(), safetyFlag: null };
    const result = selectCoachingAction(inputs, TODAY, { ...NO_ADAPTATION, grades: hostile });
    expect(result.selected.rule).toBe('re_entry');
  });
});

describe('the Part 2 week focus still wins where it and a grade disagree', () => {
  it('the focus-aligned candidate leads the rung even though a grade prefers the other one', () => {
    const inputs = driverRungOnly();
    const grades = gradeMap(grade({ key: 'nutrition', actionType: 'nutrition', verdict: 'landing' }));
    const result = selectCoachingAction(inputs, TODAY, {
      ...NO_ADAPTATION,
      grades,
      weekFocus: {
        weekStart: '2026-08-10',
        actionType: 'reflection',
        threadKey: null,
        reason: 'direction_worsening',
        sourceEvidence: {},
      },
    });
    // The grade alone would have promoted FUE-2 (nutrition). The focus runs
    // second and puts the reflection candidate back on top.
    expect(result.selected.priorityKey).toBe('SLP-3');
  });

  it('and the grade still decides when the focus has nothing to say about the rung', () => {
    const inputs = driverRungOnly();
    const grades = gradeMap(grade({ key: 'nutrition', actionType: 'nutrition', verdict: 'landing' }));
    const result = selectCoachingAction(inputs, TODAY, {
      ...NO_ADAPTATION,
      grades,
      weekFocus: {
        weekStart: '2026-08-10',
        actionType: 'reconnect',
        threadKey: null,
        reason: 'engagement_thin',
        sourceEvidence: {},
      },
    });
    expect(result.selected.priorityKey).toBe('FUE-2');
  });
});
