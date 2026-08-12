/**
 * Behavioral friction signals. Pure, no database.
 *
 * Two things every test in this file is really protecting:
 *
 *   1. A signal only appears when the behavior genuinely supports it. Every
 *      threshold is tested from both sides, so a signal that fires one
 *      observation too early would fail here.
 *   2. A signal never interprets. It may say what happened. It may not say
 *      why it happened, and it may not carry health content. The last
 *      describe block checks that against every signal this module can
 *      produce.
 */
import { describe, it, expect } from 'vitest';
import {
  CONSISTENT_USE_MINIMUM_DAYS,
  CONSISTENT_USE_SHARE,
  FEATURE_DECLINE_MINIMUM_BASELINE_EVENTS,
  MINIMUM_HISTORY_DAYS_FOR_ANY_SIGNAL,
  NOT_REVISITED_AFTER_DAYS,
  REPEATED_START_MINIMUM,
  RETURN_AFTER_ABSENCE_GAP_DAYS,
  RETURN_RECENCY_DAYS,
  VIEW_WITHOUT_ENGAGEMENT_MINIMUM_VIEWS,
  consistentUseSignals,
  evidenceSufficiency,
  featureDeclineSignals,
  incompleteFlowSignals,
  insufficientHistorySignal,
  longAbsenceSignals,
  notRevisitedSignals,
  overallDeclineSignals,
  returnedAfterAbsenceSignals,
  viewWithoutEngagementSignals,
} from '../lib/analytics-service/friction';
import type {
  ConsistentUseDetection,
  FeatureChangeDetection,
  IncompleteFlowDetection,
  MemberEngagementFacts,
  ViewWithoutEngagementDetection,
} from '../lib/analytics-service/types';

const REFERENCE = '2026-06-30';

function facts(overrides: Partial<MemberEngagementFacts> = {}): MemberEngagementFacts {
  return {
    memberId: '00000000-0000-0000-0000-0000000000bb',
    displayName: 'Test Member',
    accountCreatedDate: '2026-01-01',
    isTestAccount: false,
    referenceDate: REFERENCE,
    firstActivityDate: '2026-01-02',
    lastActivityDate: '2026-06-29',
    daysSinceLastActivity: 1,
    daysSinceAccountCreated: 180,
    historyDays: 180,
    lifetimeActiveDays: 60,
    recentActiveDays: 7,
    recentWindowDays: 14,
    baselineActiveDays: 14,
    baselineWindowDays: 28,
    typicalGapDays: 2,
    longestGapDays: 5,
    latestGapDays: 2,
    ...overrides,
  };
}

function flow(overrides: Partial<IncompleteFlowDetection> = {}): IncompleteFlowDetection {
  return {
    memberId: facts().memberId,
    displayName: 'Test Member',
    flowKey: 'daily_reset',
    label: 'Daily Reset',
    featureKey: 'daily_reset_flow',
    startedEvents: 5,
    completedEvents: 1,
    startedDays: 4,
    unfinishedEvents: 4,
    completionRate: 20,
    lastStartedDate: '2026-06-28',
    lastCompletedDate: '2026-06-20',
    ...overrides,
  };
}

function view(
  overrides: Partial<ViewWithoutEngagementDetection> = {}
): ViewWithoutEngagementDetection {
  return {
    memberId: facts().memberId,
    displayName: 'Test Member',
    featureKey: 'reset_plan',
    label: 'Reset Plan',
    views: 4,
    viewDays: 4,
    engagements: 0,
    engagementRate: 0,
    firstViewDate: '2026-06-10',
    lastViewDate: '2026-06-20',
    ...overrides,
  };
}

function featureChange(overrides: Partial<FeatureChangeDetection> = {}): FeatureChangeDetection {
  return {
    memberId: facts().memberId,
    displayName: 'Test Member',
    featureKey: 'food_logging',
    label: 'Food and protein logging',
    recentWindow: { start: '2026-06-17', end: '2026-06-30', days: 14 },
    baselineWindow: { start: '2026-05-20', end: '2026-06-16', days: 28 },
    recentEvents: 1,
    baselineEvents: 20,
    recentDays: 1,
    baselineDays: 12,
    recentRatePerDay: 0.071,
    baselineRatePerDay: 0.714,
    changeRatio: 0.1,
    lastUsedDate: '2026-06-18',
    ...overrides,
  };
}

function consistent(overrides: Partial<ConsistentUseDetection> = {}): ConsistentUseDetection {
  return {
    memberId: facts().memberId,
    displayName: 'Test Member',
    featureKey: 'daily_reset_flow',
    label: 'Daily Reset wizard',
    usedDays: 9,
    events: 11,
    memberActiveDays: 10,
    shareOfActiveDays: 90,
    ...overrides,
  };
}

describe('repeatedly started and not completed', () => {
  it('fires when a flow is started repeatedly and finished less than half the time', () => {
    const [signal] = incompleteFlowSignals([flow()], facts());
    expect(signal!.type).toBe('repeated_incomplete_flow');
    expect(signal!.reason).toBe(
      'Daily Reset was started 5 times and completed 1 time in this period.'
    );
    expect(signal!.evidence.startedEvents).toBe(5);
    expect(signal!.evidence.completedEvents).toBe(1);
  });

  it('does not fire on a single abandoned attempt', () => {
    const rows = [flow({ startedEvents: REPEATED_START_MINIMUM - 1, completedEvents: 0 })];
    expect(incompleteFlowSignals(rows, facts())).toHaveLength(0);
  });

  it('does not fire when she mostly does finish', () => {
    expect(incompleteFlowSignals([flow({ startedEvents: 6, completedEvents: 4 })], facts())).toHaveLength(
      0
    );
  });

  it('the completion boundary is exactly half', () => {
    expect(
      incompleteFlowSignals([flow({ startedEvents: 4, completedEvents: 2 })], facts())
    ).toHaveLength(0);
    expect(
      incompleteFlowSignals([flow({ startedEvents: 4, completedEvents: 1 })], facts())
    ).toHaveLength(1);
  });

  it('reports every flow that qualifies, not just the first', () => {
    const signals = incompleteFlowSignals(
      [flow(), flow({ flowKey: 'reset_plan_setup', label: 'Reset Plan setup' })],
      facts()
    );
    expect(signals).toHaveLength(2);
  });
});

describe('onboarding never completed', () => {
  it('fires on the very first unfinished onboarding, because never setting up is worth seeing at once', () => {
    const [signal] = incompleteFlowSignals(
      [flow({ flowKey: 'onboarding', label: 'Onboarding', startedEvents: 1, completedEvents: 0 })],
      facts()
    );
    expect(signal!.type).toBe('onboarding_not_completed');
    expect(signal!.reason).toContain('has never been completed');
  });

  it('does not fire once onboarding has been completed, however many times it was reopened', () => {
    expect(
      incompleteFlowSignals(
        [flow({ flowKey: 'onboarding', startedEvents: 9, completedEvents: 1 })],
        facts()
      )
    ).toHaveLength(0);
  });
});

describe('viewed without engaging', () => {
  it('fires when a feature was opened repeatedly and nothing was done inside it', () => {
    const [signal] = viewWithoutEngagementSignals([view()], facts());
    expect(signal!.type).toBe('viewed_without_engaging');
    expect(signal!.reason).toContain('with nothing done inside it');
  });

  it('does not fire on one or two visits', () => {
    expect(
      viewWithoutEngagementSignals(
        [view({ views: VIEW_WITHOUT_ENGAGEMENT_MINIMUM_VIEWS - 1, viewDays: 2 })],
        facts()
      )
    ).toHaveLength(0);
  });

  it('does not fire when she did engage even once', () => {
    expect(viewWithoutEngagementSignals([view({ engagements: 1 })], facts())).toHaveLength(0);
  });
});

describe('opened once and not revisited', () => {
  it('fires when a single visit is old and she has used the app since', () => {
    const [signal] = notRevisitedSignals(
      [view({ views: 1, viewDays: 1, lastViewDate: '2026-06-10' })],
      facts({ lastActivityDate: '2026-06-29' }),
      REFERENCE
    );
    expect(signal!.type).toBe('opened_once_not_revisited');
    expect(signal!.evidence.daysSinceLastView).toBe(20);
  });

  it('does not fire while the visit is still recent', () => {
    const recent = new Date(`${REFERENCE}T00:00:00Z`);
    recent.setUTCDate(recent.getUTCDate() - (NOT_REVISITED_AFTER_DAYS - 1));
    const lastViewDate = recent.toISOString().slice(0, 10);
    expect(
      notRevisitedSignals(
        [view({ views: 1, viewDays: 1, lastViewDate })],
        facts({ lastActivityDate: REFERENCE }),
        REFERENCE
      )
    ).toHaveLength(0);
  });

  it('does not fire when she has not been back to the app at all, which is a different signal', () => {
    expect(
      notRevisitedSignals(
        [view({ views: 1, viewDays: 1, lastViewDate: '2026-06-10' })],
        facts({ lastActivityDate: '2026-06-10' }),
        REFERENCE
      )
    ).toHaveLength(0);
  });

  it('does not fire when she visited on more than one day', () => {
    expect(
      notRevisitedSignals(
        [view({ views: 3, viewDays: 2, lastViewDate: '2026-06-10' })],
        facts({ lastActivityDate: '2026-06-29' }),
        REFERENCE
      )
    ).toHaveLength(0);
  });
});

describe('a feature she used to use', () => {
  it('fires when the rate has more than halved against her own baseline', () => {
    const [signal] = featureDeclineSignals([featureChange()], facts());
    expect(signal!.type).toBe('feature_use_declined');
    expect(signal!.comparisonPeriod).toEqual({
      recent: { start: '2026-06-17', end: '2026-06-30', days: 14 },
      baseline: { start: '2026-05-20', end: '2026-06-16', days: 28 },
    });
  });

  it('does not fire without enough baseline usage to call it a habit', () => {
    expect(
      featureDeclineSignals(
        [
          featureChange({
            baselineEvents: FEATURE_DECLINE_MINIMUM_BASELINE_EVENTS - 1,
            changeRatio: 0.1,
          }),
        ],
        facts()
      )
    ).toHaveLength(0);
  });

  it('does not fire when there is no baseline at all', () => {
    expect(
      featureDeclineSignals([featureChange({ baselineEvents: 0, changeRatio: null })], facts())
    ).toHaveLength(0);
  });

  it('does not fire on a mild dip', () => {
    expect(featureDeclineSignals([featureChange({ changeRatio: 0.8 })], facts())).toHaveLength(0);
    expect(featureDeclineSignals([featureChange({ changeRatio: 0.5 })], facts())).toHaveLength(0);
    expect(featureDeclineSignals([featureChange({ changeRatio: 0.49 })], facts())).toHaveLength(1);
  });
});

describe('overall activity declined', () => {
  it('fires against her own baseline and carries both windows', () => {
    const [signal] = overallDeclineSignals(facts({ recentActiveDays: 2, baselineActiveDays: 14 }));
    expect(signal!.type).toBe('overall_activity_declined');
    expect(signal!.comparisonPeriod!.recent).toEqual({
      start: '2026-06-17',
      end: '2026-06-30',
      days: 14,
    });
    expect(signal!.comparisonPeriod!.baseline).toEqual({
      start: '2026-05-20',
      end: '2026-06-16',
      days: 28,
    });
  });

  it('never fires without enough of her own history to have a baseline', () => {
    expect(
      overallDeclineSignals(facts({ historyDays: 20, recentActiveDays: 0, baselineActiveDays: 2 }))
    ).toHaveLength(0);
  });

  it('does not fire when she is holding steady', () => {
    expect(overallDeclineSignals(facts({ recentActiveDays: 7, baselineActiveDays: 14 }))).toHaveLength(
      0
    );
  });
});

describe('long absence and coming back', () => {
  it('fires when she has been away longer than her own tolerance', () => {
    const [signal] = longAbsenceSignals(
      facts({ typicalGapDays: 1, daysSinceLastActivity: 12, lastActivityDate: '2026-06-18' })
    );
    expect(signal!.type).toBe('long_absence');
    expect(signal!.evidence.comparisonBasis).toBe('her own usual gap');
  });

  it('says so when it had to fall back to a fixed threshold', () => {
    const [signal] = longAbsenceSignals(
      facts({
        historyDays: 20,
        baselineActiveDays: 0,
        typicalGapDays: null,
        daysSinceLastActivity: 12,
        lastActivityDate: '2026-06-18',
      })
    );
    expect(signal!.evidence.comparisonBasis).toBe('fixed threshold');
    expect(signal!.reason).toContain('not enough history to know her usual rhythm');
  });

  it('does not fire for a gap that is normal for her', () => {
    expect(
      longAbsenceSignals(
        facts({ typicalGapDays: 7, daysSinceLastActivity: 14, baselineActiveDays: 4 })
      )
    ).toHaveLength(0);
  });

  it('reports a return after a long absence, and only while the return is still the news', () => {
    const returned = returnedAfterAbsenceSignals(
      facts({ latestGapDays: RETURN_AFTER_ABSENCE_GAP_DAYS, daysSinceLastActivity: 1 })
    );
    expect(returned[0]!.type).toBe('returned_after_absence');

    expect(
      returnedAfterAbsenceSignals(
        facts({ latestGapDays: RETURN_AFTER_ABSENCE_GAP_DAYS - 1, daysSinceLastActivity: 1 })
      )
    ).toHaveLength(0);
    expect(
      returnedAfterAbsenceSignals(
        facts({
          latestGapDays: RETURN_AFTER_ABSENCE_GAP_DAYS,
          daysSinceLastActivity: RETURN_RECENCY_DAYS + 1,
        })
      )
    ).toHaveLength(0);
  });
});

describe('consistent use, the thing that is working', () => {
  it('fires when a feature appears on most of her active days', () => {
    const [signal] = consistentUseSignals([consistent()], facts());
    expect(signal!.type).toBe('consistent_feature_use');
    expect(signal!.evidence.shareOfActiveDays).toBe(90);
  });

  it('does not fire on too few active days to mean anything', () => {
    expect(
      consistentUseSignals(
        [
          consistent({
            memberActiveDays: CONSISTENT_USE_MINIMUM_DAYS - 1,
            usedDays: CONSISTENT_USE_MINIMUM_DAYS - 1,
            shareOfActiveDays: 100,
          }),
        ],
        facts()
      )
    ).toHaveLength(0);
  });

  it('the share boundary is inclusive at the documented threshold', () => {
    expect(
      consistentUseSignals([consistent({ shareOfActiveDays: CONSISTENT_USE_SHARE })], facts())
    ).toHaveLength(1);
    expect(
      consistentUseSignals([consistent({ shareOfActiveDays: CONSISTENT_USE_SHARE - 1 })], facts())
    ).toHaveLength(0);
  });
});

describe('not enough data to say anything', () => {
  it('says so explicitly for a member with no activity at all', () => {
    const signal = insufficientHistorySignal(
      facts({
        lastActivityDate: null,
        firstActivityDate: null,
        daysSinceLastActivity: null,
        historyDays: null,
        lifetimeActiveDays: 0,
        daysSinceAccountCreated: 40,
      })
    );
    expect(signal!.type).toBe('insufficient_behavioral_history');
    expect(signal!.evidenceSufficiency).toBe('low');
  });

  it('says so for a member with a few days of history', () => {
    const signal = insufficientHistorySignal(
      facts({ historyDays: MINIMUM_HISTORY_DAYS_FOR_ANY_SIGNAL - 1, lifetimeActiveDays: 2 })
    );
    expect(signal!.type).toBe('insufficient_behavioral_history');
    expect(signal!.reason).toContain('not enough to tell a pattern from a normal week');
  });

  it('returns nothing once there is enough history, so it never masks a real signal', () => {
    expect(
      insufficientHistorySignal(facts({ historyDays: MINIMUM_HISTORY_DAYS_FOR_ANY_SIGNAL }))
    ).toBeNull();
  });
});

describe('evidence sufficiency', () => {
  it('is decided by how much behavior was observed and nothing else', () => {
    expect(evidenceSufficiency(12, 40).level).toBe('strong');
    expect(evidenceSufficiency(12, 20).level).toBe('moderate');
    expect(evidenceSufficiency(5, 40).level).toBe('moderate');
    expect(evidenceSufficiency(3, 40).level).toBe('low');
    expect(evidenceSufficiency(12, null).level).toBe('low');
  });

  it('every reason explains the amount of data, never a degree of certainty about the member', () => {
    for (const [observations, days] of [
      [12, 40],
      [5, 15],
      [1, 3],
    ] as const) {
      const reason = evidenceSufficiency(observations, days).reason.toLowerCase();
      expect(reason).toContain('app history');
      for (const word of ['likely', 'probably', 'risk', 'severe', 'diagnos', 'health']) {
        expect(reason).not.toContain(word);
      }
    }
  });
});

describe('no signal ever interprets or carries health content', () => {
  const allSignals = () => [
    ...incompleteFlowSignals(
      [flow(), flow({ flowKey: 'onboarding', startedEvents: 2, completedEvents: 0 })],
      facts()
    ),
    ...viewWithoutEngagementSignals([view()], facts()),
    ...notRevisitedSignals(
      [view({ views: 1, viewDays: 1, lastViewDate: '2026-06-10' })],
      facts({ lastActivityDate: '2026-06-29' }),
      REFERENCE
    ),
    ...featureDeclineSignals([featureChange()], facts()),
    ...overallDeclineSignals(facts({ recentActiveDays: 2, baselineActiveDays: 14 })),
    ...longAbsenceSignals(facts({ typicalGapDays: 1, daysSinceLastActivity: 12 })),
    ...returnedAfterAbsenceSignals(facts({ latestGapDays: 30, daysSinceLastActivity: 1 })),
    ...consistentUseSignals([consistent()], facts()),
  ];

  it('produces the full set, so the checks below are not passing on an empty list', () => {
    const signals = allSignals();
    expect(signals.length).toBeGreaterThanOrEqual(8);
    expect(new Set(signals.map((signal) => signal.type)).size).toBeGreaterThanOrEqual(8);
  });

  it('no reason line ever explains why the member behaved as she did', () => {
    const interpretive = [
      'motivat',
      'lazy',
      'struggling',
      'overwhelmed',
      'burnt out',
      'burned out',
      'does not care',
      'gave up',
      'because she',
      'she feels',
      'she is not ready',
      'she needs',
      'she should',
    ];

    for (const signal of allSignals()) {
      const serialized = JSON.stringify(signal).toLowerCase();
      for (const word of interpretive) {
        expect(serialized, `${signal.type} should not contain "${word}"`).not.toContain(word);
      }
    }
  });

  /**
   * A feature NAME is not health content. "Food and protein logging" is the
   * label of a screen, straight out of the analytics registry, and a signal
   * naming the feature a member stopped using has to be able to say which
   * one. What may never appear is an ANSWER: what she logged, how she
   * slept, where it hurt. The words below can only come from an answer,
   * never from a screen name.
   */
  it('no signal carries anything that could only have come from a health answer', () => {
    const answerWords = [
      'pain',
      'hurts',
      'ache',
      'sore',
      'symptom',
      'diagnos',
      'medication',
      'insomnia',
      'grams',
      'hours of sleep',
      'rated',
      'reported',
      'answered',
    ];

    for (const signal of allSignals()) {
      const serialized = JSON.stringify(signal).toLowerCase();
      for (const word of answerWords) {
        expect(serialized, `${signal.type} should not contain "${word}"`).not.toContain(word);
      }
    }
  });

  it('every evidence key is a behavioral name, never a health field name', () => {
    const forbiddenKeys = [
      'answer',
      'answers',
      'response',
      'responses',
      'painlocation',
      'sleepquality',
      'sleephours',
      'energy',
      'stress',
      'mood',
      'recovery',
      'symptoms',
      'notes',
      'reflection',
      'checkinvalue',
      'nutrition',
      'calories',
      'macros',
    ];

    for (const signal of allSignals()) {
      for (const key of Object.keys(signal.evidence)) {
        expect(forbiddenKeys, `${signal.type}.${key}`).not.toContain(key.toLowerCase());
      }
    }
  });

  it('every evidence value is a number, a date, or a short behavioral label, never free text', () => {
    for (const signal of allSignals()) {
      for (const [key, value] of Object.entries(signal.evidence)) {
        if (value === null) continue;
        if (typeof value === 'number') continue;
        expect(typeof value, `${signal.type}.${key}`).toBe('string');
        // Long strings are how prose, and therefore health content, would
        // arrive. Every legitimate value here is a slug or a date.
        expect((value as string).length, `${signal.type}.${key}`).toBeLessThanOrEqual(40);
      }
    }
  });

  it('every signal carries a sufficiency level and a reason for it', () => {
    for (const signal of allSignals()) {
      expect(['low', 'moderate', 'strong']).toContain(signal.evidenceSufficiency);
      expect(signal.evidenceSufficiencyReason.length).toBeGreaterThan(0);
      expect(signal.reason.length).toBeGreaterThan(0);
      expect(Object.keys(signal.evidence).length).toBeGreaterThan(0);
    }
  });
});
