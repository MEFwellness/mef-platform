/**
 * The product insights view and the member table's sort control: the pure
 * rules, with no database.
 *
 * Everything asserted here is a decision the screens make about ordering,
 * wording and honesty, so it is tested where the decision lives rather than
 * by rendering a page (the screens in this repo cannot be unit-rendered, the
 * same constraint the first five views already work around).
 *
 * The two things this file exists to hold the line on:
 *
 * 1. NOTHING MATCHED AND COULD NOT RUN ARE NEVER THE SAME. Every insight has
 *    to distinguish an empty result from a failed query, because collapsing
 *    them tells an administrator "there is no problem" when the truth is
 *    "nobody looked".
 *
 * 2. AN UNCOUNTED SIGNAL IS NOT A ZERO. The signals sort has to place a
 *    member whose signals were never counted below every counted member,
 *    rather than ranking her as having none.
 */

import { describe, it, expect } from 'vitest';
import {
  INSIGHTS_INTRO,
  INSIGHTS_NOT_A_RECOMMENDATION,
  INSIGHT_ROW_LIMIT,
  capRows,
  disengagedInsight,
  featureDeclineInsight,
  incompleteFlowInsight,
  insightsHref,
  readableKey,
  reducedUsageInsight,
  unavailableInsight,
  weakestStageInsight,
} from '../lib/analytics-dashboard/insightsView';
import {
  DEFAULT_MEMBER_SORT,
  MEMBER_SORT_KEYS,
  MEMBER_SORT_LABEL,
  MEMBER_SORT_MEANING,
  membersTableHref,
  memberDetailHref,
  parseMemberSort,
  sortMembers,
} from '../lib/analytics-dashboard/memberView';
import { parseDashboardView } from '../lib/analytics-dashboard/viewState';
import type {
  IncompleteFlowDetection,
  MemberEngagement,
  MemberEngagementFacts,
  PlatformFeatureTrend,
  WeakestFunnelStage,
} from '../lib/analytics-service';

const TODAY = '2026-03-31';

function facts(overrides: Partial<MemberEngagementFacts> = {}): MemberEngagementFacts {
  return {
    memberId: 'm-1',
    displayName: 'Member',
    isTestAccount: false,
    accountCreatedDate: '2025-01-01',
    daysSinceAccountCreated: 400,
    firstActivityDate: '2025-01-02',
    lastActivityDate: '2026-03-30',
    daysSinceLastActivity: 1,
    historyDays: 100,
    lifetimeActiveDays: 50,
    recentActiveDays: 5,
    recentWindowDays: 14,
    baselineActiveDays: 10,
    baselineWindowDays: 28,
    typicalGapDays: 2,
    ...overrides,
  } as MemberEngagementFacts;
}

function member(overrides: Partial<MemberEngagement> = {}): MemberEngagement {
  const memberFacts = overrides.facts ?? facts();
  return {
    memberId: memberFacts.memberId,
    displayName: memberFacts.displayName,
    state: 'ACTIVE',
    basis: 'fixed_thresholds',
    reason: 'Active within the last 7 days.',
    ...overrides,
    facts: memberFacts,
  } as MemberEngagement;
}

// ---------------------------------------------------------------------
// The three outcomes stay three outcomes
// ---------------------------------------------------------------------

describe('an empty result and a failed query never look the same', () => {
  it('a failed query is reported as unavailable, with its own error kept', () => {
    const insight = unavailableInsight('k', 'Title', 'Question?', 'the database said no');
    expect(insight.status).toBe('unavailable');
    expect(insight.error).toBe('the database said no');
    expect(insight.rows).toHaveLength(0);
    // The headline has to say this is not a "nothing found" result.
    expect(insight.headline.toLowerCase()).toContain('not a result of');
  });

  it('an empty result is nothing_matched, and carries no error', () => {
    const insight = disengagedInsight([]);
    expect(insight.status).toBe('nothing_matched');
    expect(insight.error).toBeUndefined();
    expect(insight.rows).toHaveLength(0);
  });

  it('a real result is a finding', () => {
    const insight = disengagedInsight([
      member({ state: 'INACTIVE', facts: facts({ daysSinceLastActivity: 40 }) }),
    ]);
    expect(insight.status).toBe('finding');
    expect(insight.rows).toHaveLength(1);
  });

  it('every insight always states the rule that decided it, in all three outcomes', () => {
    const all = [
      disengagedInsight([]),
      disengagedInsight([member({ state: 'INACTIVE' })]),
      unavailableInsight('k', 'Title', 'Which members have stopped using the product?', 'e'),
    ];
    for (const insight of all) {
      expect(insight.rule.length).toBeGreaterThan(0);
      expect(insight.question.endsWith('?')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------
// The funnel stage
// ---------------------------------------------------------------------

describe('the weakest funnel stage', () => {
  const base: WeakestFunnelStage = {
    stageKey: 'onboarding_completed',
    label: 'Finished onboarding',
    previousStageKey: 'signed_up',
    membersLost: 6,
    dropOffRate: 60,
    reason: '6 of 10 members did not go from "Signed up" to "Finished onboarding".',
  };

  it('renders the service layer reason verbatim as the headline', () => {
    expect(weakestStageInsight(base).headline).toBe(base.reason);
  });

  it('losing nobody is nothing_matched, not a finding of zero', () => {
    const none = { ...base, membersLost: 0, reason: 'No measurable funnel stage lost any members.' };
    expect(weakestStageInsight(none).status).toBe('nothing_matched');
  });

  it('a null cohort is nothing_matched and still explains itself', () => {
    const empty: WeakestFunnelStage = {
      stageKey: null,
      label: null,
      previousStageKey: null,
      membersLost: null,
      dropOffRate: null,
      reason: 'No members signed up inside this period.',
    };
    const insight = weakestStageInsight(empty);
    expect(insight.status).toBe('nothing_matched');
    expect(insight.headline).toBe(empty.reason);
  });

  it('omits the rate row when there is no honest rate to give', () => {
    const insight = weakestStageInsight({ ...base, dropOffRate: null });
    expect(insight.rows.some((row) => row.key === 'rate')).toBe(false);
    expect(insight.rows.some((row) => row.key === 'lost')).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Feature declines
// ---------------------------------------------------------------------

describe('feature declines', () => {
  const options = { minimumBaselineEvents: 10, declineRatio: 0.5, windowDays: 14 };

  function feature(overrides: Partial<PlatformFeatureTrend> = {}): PlatformFeatureTrend {
    return {
      featureKey: 'food_lens',
      label: 'Food Lens',
      recentEvents: 3,
      baselineEvents: 20,
      recentMembers: 1,
      baselineMembers: 4,
      recentRatePerDay: 0.2,
      baselineRatePerDay: 1.4,
      changeRatio: 0.15,
      ...overrides,
    };
  }

  it('prints the exclusion rule, so "no feature declined" cannot be misread', () => {
    const insight = featureDeclineInsight([], options);
    expect(insight.rule).toContain('10');
    expect(insight.rule).toContain('has not declined');
    expect(insight.headline).toContain('never used enough to be eligible');
  });

  it('states the threshold that actually ran, not a restated one', () => {
    const insight = featureDeclineInsight([], { ...options, declineRatio: 0.5, windowDays: 21 });
    expect(insight.rule).toContain('50 percent');
    expect(insight.rule).toContain('21 days');
  });

  it('a null change ratio reads as not measured, never as zero', () => {
    const insight = featureDeclineInsight([feature({ changeRatio: null })], options);
    expect(insight.rows[0]!.value).toBe('Not measured');
    expect(insight.rows[0]!.value).not.toContain('0%');
  });

  it('shows both sides of the comparison behind the ratio', () => {
    const insight = featureDeclineInsight([feature()], options);
    expect(insight.rows[0]!.detail).toContain('3');
    expect(insight.rows[0]!.detail).toContain('20');
  });
});

// ---------------------------------------------------------------------
// Incomplete flows
// ---------------------------------------------------------------------

describe('flows started and not finished', () => {
  function flow(overrides: Partial<IncompleteFlowDetection> = {}): IncompleteFlowDetection {
    return {
      memberId: 'm-1',
      displayName: 'Member One',
      flowKey: 'daily_reset',
      label: 'Daily Reset',
      featureKey: 'daily_reset',
      startedEvents: 4,
      completedEvents: 1,
      startedDays: 4,
      unfinishedEvents: 3,
      completionRate: 25,
      lastStartedDate: '2026-03-20',
      lastCompletedDate: '2026-03-10',
      ...overrides,
    } as IncompleteFlowDetection;
  }

  it('groups by flow, not by member, and counts the members behind each', () => {
    const insight = incompleteFlowInsight(
      [flow(), flow({ memberId: 'm-2', displayName: 'Member Two', unfinishedEvents: 2 })],
      { repeatedStartMinimum: 3 }
    );
    expect(insight.rows).toHaveLength(1);
    expect(insight.rows[0]!.value).toContain('5');
    expect(insight.rows[0]!.detail).toContain('2 members');
  });

  it('uses the flow registry label, so it cannot disagree with the drop-off screen', () => {
    const insight = incompleteFlowInsight([flow({ label: 'Daily Reset' })], {
      repeatedStartMinimum: 3,
    });
    expect(insight.rows[0]!.label).toBe('Daily Reset');
  });

  it('orders flows by how many starts were left unfinished', () => {
    const insight = incompleteFlowInsight(
      [
        flow({ flowKey: 'onboarding', label: 'Onboarding', unfinishedEvents: 1 }),
        flow({ flowKey: 'daily_reset', label: 'Daily Reset', unfinishedEvents: 9 }),
      ],
      { repeatedStartMinimum: 3 }
    );
    expect(insight.rows.map((row) => row.label)).toEqual(['Daily Reset', 'Onboarding']);
  });

  it('names the onboarding exception in the rule', () => {
    const insight = incompleteFlowInsight([], { repeatedStartMinimum: 3 });
    expect(insight.rule).toContain('Onboarding');
    expect(insight.rule).toContain('3');
  });
});

// ---------------------------------------------------------------------
// The two member insights
// ---------------------------------------------------------------------

describe('the member insights', () => {
  it('never active is said in words, not as a number or a dash', () => {
    const insight = disengagedInsight([
      member({ state: 'INACTIVE', facts: facts({ daysSinceLastActivity: null, lastActivityDate: null }) }),
    ]);
    expect(insight.rows[0]!.value).toBe('Never active');
  });

  it('says "1 day" when it is one day', () => {
    const insight = disengagedInsight([
      member({ state: 'INACTIVE', facts: facts({ daysSinceLastActivity: 1 }) }),
    ]);
    expect(insight.rows[0]!.value).toBe('1 day since last active');
  });

  it('renders the service layer reason verbatim under each member', () => {
    const reason = 'Away 30 days, longer than the 21 day fixed threshold.';
    const insight = disengagedInsight([member({ state: 'INACTIVE', reason })]);
    expect(insight.rows[0]!.detail).toBe(reason);
  });

  it('carries the member id so the row can link to her own timeline', () => {
    const insight = disengagedInsight([member({ state: 'INACTIVE' })]);
    expect(insight.rows[0]!.memberId).toBe('m-1');
  });

  it('a member with no display name is identified by a short id, never left blank', () => {
    const insight = disengagedInsight([
      member({ facts: facts({ displayName: null }), state: 'INACTIVE' }),
    ]);
    expect(insight.rows[0]!.label).toContain('Member m-1');
  });

  it('the reduced-usage empty state explains why thin data produces nothing', () => {
    const insight = reducedUsageInsight([]);
    expect(insight.headline).toContain('baseline');
    expect(insight.rule).toContain('excluded rather than counted as declining');
  });
});

// ---------------------------------------------------------------------
// Truncation is never silent
// ---------------------------------------------------------------------

describe('capped lists say what they are holding back', () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({
    key: `k-${index}`,
    label: `Row ${index}`,
    value: '1',
  }));

  it('says how many were shown and how many were not', () => {
    const { shown, hiddenNote } = capRows(rows);
    expect(shown).toHaveLength(INSIGHT_ROW_LIMIT);
    expect(hiddenNote).toContain(String(INSIGHT_ROW_LIMIT));
    expect(hiddenNote).toContain('20');
    expect(hiddenNote).toContain('12');
  });

  it('adds no note when nothing was held back', () => {
    const { shown, hiddenNote } = capRows(rows.slice(0, 3));
    expect(shown).toHaveLength(3);
    expect(hiddenNote).toBeNull();
  });
});

// ---------------------------------------------------------------------
// Screen copy and links
// ---------------------------------------------------------------------

describe('the screen says what it is and is not', () => {
  it('states that nothing is generated and nothing says why', () => {
    expect(INSIGHTS_INTRO).toContain('Nothing here is generated');
    expect(INSIGHTS_INTRO).toContain('nothing here says why');
  });

  it('states that a member never appears here because of anything about her health', () => {
    expect(INSIGHTS_NOT_A_RECOMMENDATION).toContain('never because of anything she reported');
  });

  it('carries the range and the test-account toggle, like every other view', () => {
    const view = parseDashboardView({ range: '7d', test: 'on' }, TODAY);
    const href = insightsHref(view);
    expect(href).toContain('/admin/analytics/insights');
    expect(href).toContain('range=7d');
    expect(href).toContain('test=on');
  });

  it('no copy on this screen uses an em dash', () => {
    for (const text of [INSIGHTS_INTRO, INSIGHTS_NOT_A_RECOMMENDATION]) {
      expect(text).not.toContain('—');
    }
  });

  it('makes a raw key readable without inventing a name for it', () => {
    expect(readableKey('daily_reset')).toBe('Daily reset');
    expect(readableKey('foodLens')).toBe('Food lens');
  });
});

// ---------------------------------------------------------------------
// The member table's sort
// ---------------------------------------------------------------------

describe('the member table sort', () => {
  const away = member({
    facts: facts({ memberId: 'a', displayName: 'Zoe', daysSinceLastActivity: 40, typicalGapDays: 9 }),
    state: 'INACTIVE',
  });
  const never = member({
    facts: facts({
      memberId: 'b',
      displayName: 'Anna',
      daysSinceLastActivity: null,
      lastActivityDate: null,
      typicalGapDays: null,
    }),
    state: 'INACTIVE',
  });
  const active = member({
    facts: facts({ memberId: 'c', displayName: 'Mira', daysSinceLastActivity: 1, typicalGapDays: 2 }),
    state: 'ACTIVE',
  });
  const all = [active, away, never];

  it('defaults to the attention order the build specified', () => {
    expect(parseMemberSort(undefined)).toBe('attention');
    expect(parseMemberSort('not-a-sort')).toBe(DEFAULT_MEMBER_SORT);
    const sorted = sortMembers(all, 'attention');
    // Inactive before Active, and never-active is the longest absence.
    expect(sorted.map((m) => m.memberId)).toEqual(['b', 'a', 'c']);
  });

  it('every sort key is a real key, is labelled, and is explained on screen', () => {
    for (const key of MEMBER_SORT_KEYS) {
      expect(parseMemberSort(key)).toBe(key);
      expect(MEMBER_SORT_LABEL[key].length).toBeGreaterThan(0);
      expect(MEMBER_SORT_MEANING[key].length).toBeGreaterThan(0);
      expect(MEMBER_SORT_MEANING[key]).not.toContain('—');
    }
  });

  it('sorts by name alphabetically, ignoring case', () => {
    expect(sortMembers(all, 'name').map((m) => m.memberId)).toEqual(['b', 'c', 'a']);
  });

  it('sorts by last active with never active above every finite absence', () => {
    expect(sortMembers(all, 'lastActive').map((m) => m.memberId)).toEqual(['b', 'a', 'c']);
  });

  it('sorts by rhythm fastest first, with an unknown rhythm placed last', () => {
    expect(sortMembers(all, 'rhythm').map((m) => m.memberId)).toEqual(['c', 'a', 'b']);
  });

  it('an uncounted signal count sorts last, and is not treated as zero', () => {
    const counts = new Map([
      ['a', 0], // counted, and genuinely has none
      ['c', 3], // counted, has three
      // 'b' was never counted at all
    ]);
    const sorted = sortMembers(all, 'signals', counts);
    expect(sorted.map((m) => m.memberId)).toEqual(['c', 'a', 'b']);
  });

  it('sorting never adds or removes a member', () => {
    for (const key of MEMBER_SORT_KEYS) {
      expect(sortMembers(all, key).map((m) => m.memberId).sort()).toEqual(['a', 'b', 'c']);
    }
  });

  it('does not mutate the array it was given', () => {
    const original = [...all];
    sortMembers(all, 'name');
    expect(all).toEqual(original);
  });

  it('the sort rides along in the table and detail links, with the range and toggle', () => {
    const view = parseDashboardView({ range: '90d', test: 'on' }, TODAY);
    const table = membersTableHref(view, 'INACTIVE', 'rhythm');
    expect(table).toContain('range=90d');
    expect(table).toContain('test=on');
    expect(table).toContain('state=INACTIVE');
    expect(table).toContain('sort=rhythm');

    const detail = memberDetailHref('m-1', view, { state: 'INACTIVE', sort: 'rhythm' });
    expect(detail).toContain('sort=rhythm');
    expect(detail).toContain('test=on');
  });

  it('the default sort is left out of the URL rather than written into it', () => {
    const view = parseDashboardView({}, TODAY);
    expect(membersTableHref(view, 'all', 'attention')).not.toContain('sort=');
  });
});
