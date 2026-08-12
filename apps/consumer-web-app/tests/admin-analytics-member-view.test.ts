/**
 * The member engagement views' rules, proved without a database.
 *
 * Sorting, filtering, the test-account toggle riding along every link, how a
 * signal is labelled including the insufficient-history case, the
 * before/after controls, and every empty state. All of it lives in
 * lib/analytics-dashboard/memberView.ts, is pure, and is tested here.
 *
 * The two screens themselves are React server components, which this repo
 * cannot render in a unit test (they await server actions that call
 * cookies() from next/headers, which throws outside a Next.js request
 * scope), so they are checked structurally at the bottom of this file: each
 * one really does call the guard, really does read only through the
 * authorized action layer, really has an empty state, and really is not a
 * client component.
 *
 * The access boundary itself is proved for real, against real row level
 * security and the real database functions, in
 * admin-analytics-member-access.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseDashboardView } from '../lib/analytics-dashboard/viewState';
import {
  COMPARISON_WINDOW_CHOICES,
  ENGAGEMENT_BASIS_LABEL,
  ENGAGEMENT_BASIS_MEANING,
  ENGAGEMENT_STATE_ORDER,
  INSUFFICIENT_HISTORY_LABEL,
  MEMBER_EMPTY_COPY,
  MEMBER_STATE_FILTERS,
  SIGNALS_NOT_COUNTED,
  SIGNAL_COUNT_NOTE,
  SIGNAL_TITLE,
  SIGNAL_TONE,
  afterWindowNotice,
  beforeAfterRows,
  countMembersByState,
  daysAwayLabel,
  evidenceEntries,
  evidenceLabel,
  evidenceValue,
  filterMembersByState,
  historyLabel,
  isInsufficientHistory,
  isStuckSignal,
  memberDetailHref,
  memberName,
  membersTableHref,
  orderSignals,
  parseComparisonControls,
  parseMemberStateFilter,
  rhythmLabel,
  signalPeriodLabel,
  sortMembersByAttention,
} from '../lib/analytics-dashboard/memberView';
import type {
  EngagementBasis,
  EngagementState,
  FrictionSignal,
  FrictionSignalType,
  MemberEngagement,
  MemberEngagementFacts,
  MemberWindowComparison,
  WindowMetrics,
} from '../lib/analytics-service';

const TODAY = '2026-08-12';

const APP = path.resolve(__dirname, '..');
const NEW_PAGE_FILES = [
  'app/admin/analytics/members/page.tsx',
  'app/admin/analytics/members/[memberId]/page.tsx',
];
const NEW_SECTION_FILES = [
  ...NEW_PAGE_FILES,
  'components/admin/analytics/memberPrimitives.tsx',
  'lib/analytics-dashboard/memberView.ts',
];

function source(relative: string): string {
  return readFileSync(path.join(APP, relative), 'utf-8');
}

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------

function facts(overrides: Partial<MemberEngagementFacts> = {}): MemberEngagementFacts {
  return {
    memberId: '11111111-1111-1111-1111-111111111111',
    displayName: 'A Member',
    accountCreatedDate: '2026-01-01',
    isTestAccount: false,
    referenceDate: TODAY,
    firstActivityDate: '2026-01-02',
    lastActivityDate: '2026-08-10',
    daysSinceLastActivity: 2,
    daysSinceAccountCreated: 223,
    historyDays: 222,
    lifetimeActiveDays: 40,
    recentActiveDays: 6,
    recentWindowDays: 14,
    baselineActiveDays: 14,
    baselineWindowDays: 28,
    typicalGapDays: 3,
    longestGapDays: 9,
    latestGapDays: 2,
    ...overrides,
  };
}

function member(
  state: EngagementState,
  daysSince: number | null,
  name: string,
  basis: EngagementBasis = 'fixed_thresholds'
): MemberEngagement {
  const memberId = `${name.toLowerCase().replace(/\W/g, '')}-id`;
  const f = facts({
    memberId,
    displayName: name,
    daysSinceLastActivity: daysSince,
    lastActivityDate: daysSince === null ? null : '2026-08-01',
  });
  return { memberId, displayName: name, state, basis, reason: `${state} because.`, facts: f };
}

function signal(overrides: Partial<FrictionSignal> = {}): FrictionSignal {
  return {
    type: 'repeated_incomplete_flow',
    reason: 'The Daily Reset was started 5 times and completed 1 time in this period.',
    evidence: { startedEvents: 5, completedEvents: 1, lastStartedDate: '2026-08-09' },
    comparisonPeriod: null,
    evidenceSufficiency: 'moderate',
    evidenceSufficiencyReason: 'Based on 5 recorded actions across 222 days of app history.',
    ...overrides,
  };
}

function windowMetrics(overrides: Partial<WindowMetrics> = {}): WindowMetrics {
  return {
    window: { start: '2026-07-15', end: '2026-07-28', days: 14 },
    activeDays: 4,
    activeDayRate: 28.6,
    signIns: 1,
    dailyResetStarted: 3,
    dailyResetCompleted: 1,
    dailyResetCompletionRate: 33.3,
    totalEvents: 20,
    averageDaysBetweenVisits: 3,
    featureUse: [],
    ...overrides,
  };
}

function comparison(overrides: Partial<MemberWindowComparison> = {}): MemberWindowComparison {
  return {
    memberId: '11111111-1111-1111-1111-111111111111',
    inScope: true,
    referenceDate: '2026-07-29',
    windowDays: 14,
    includeTestAccounts: false,
    afterWindowComplete: true,
    daysOfAfterWindowElapsed: 14,
    before: windowMetrics(),
    after: windowMetrics({
      window: { start: '2026-07-30', end: '2026-08-12', days: 14 },
      activeDays: 8,
      activeDayRate: 57.1,
      totalEvents: 40,
    }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------
// Sorting and filtering
// ---------------------------------------------------------------------

describe('most in need of attention first', () => {
  it('sorts Inactive above Watch above Active', () => {
    const sorted = sortMembersByAttention([
      member('ACTIVE', 1, 'Active One'),
      member('INACTIVE', 30, 'Inactive One'),
      member('WATCH', 12, 'Watch One'),
    ]);
    expect(sorted.map((m) => m.state)).toEqual(['INACTIVE', 'WATCH', 'ACTIVE']);
  });

  it('puts the longest away first inside each state, not across states', () => {
    const sorted = sortMembersByAttention([
      member('WATCH', 9, 'Watch Recent'),
      member('INACTIVE', 25, 'Inactive Recent'),
      member('WATCH', 20, 'Watch Older'),
      member('INACTIVE', 60, 'Inactive Older'),
    ]);
    expect(sorted.map((m) => m.displayName)).toEqual([
      'Inactive Older',
      'Inactive Recent',
      'Watch Older',
      'Watch Recent',
    ]);
  });

  it('treats never active as the longest absence there is, inside its own state', () => {
    const sorted = sortMembersByAttention([
      member('INACTIVE', 400, 'Very Long Gone'),
      member('INACTIVE', null, 'Never Active'),
    ]);
    expect(sorted[0]!.displayName).toBe('Never Active');
  });

  it('lists New members, below Active, rather than hiding them', () => {
    const sorted = sortMembersByAttention([
      member('NEW', 1, 'New One'),
      member('ACTIVE', 1, 'Active One'),
      member('INACTIVE', 30, 'Inactive One'),
    ]);
    expect(sorted.map((m) => m.state)).toEqual(['INACTIVE', 'ACTIVE', 'NEW']);
    expect(sorted).toHaveLength(3);
  });

  it('is stable: the same input always comes out in the same order', () => {
    const input = [
      member('WATCH', 10, 'Beta'),
      member('WATCH', 10, 'Alpha'),
      member('WATCH', 10, 'Gamma'),
    ];
    expect(sortMembersByAttention(input).map((m) => m.displayName)).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
    ]);
    expect(sortMembersByAttention([...input].reverse()).map((m) => m.displayName)).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
    ]);
  });

  it('does not mutate what it was given', () => {
    const input = [member('ACTIVE', 1, 'Active One'), member('INACTIVE', 30, 'Inactive One')];
    sortMembersByAttention(input);
    expect(input[0]!.state).toBe('ACTIVE');
  });
});

describe('filtering by state', () => {
  const everyone = [
    member('INACTIVE', 30, 'Inactive One'),
    member('WATCH', 12, 'Watch One'),
    member('ACTIVE', 1, 'Active One'),
    member('ACTIVE', 2, 'Active Two'),
    member('NEW', 1, 'New One'),
  ];

  it('offers All plus every state the service layer can return', () => {
    expect(MEMBER_STATE_FILTERS).toEqual(['all', ...ENGAGEMENT_STATE_ORDER]);
    expect(ENGAGEMENT_STATE_ORDER).toContain('NEW');
  });

  it('shows everybody when the filter is all', () => {
    expect(filterMembersByState(everyone, 'all')).toHaveLength(5);
  });

  it('shows only the chosen state', () => {
    expect(filterMembersByState(everyone, 'ACTIVE').map((m) => m.displayName)).toEqual([
      'Active One',
      'Active Two',
    ]);
    expect(filterMembersByState(everyone, 'INACTIVE')).toHaveLength(1);
  });

  it('returns an empty list rather than everybody when nobody is in that state', () => {
    const noneInactive = everyone.filter((m) => m.state !== 'INACTIVE');
    expect(filterMembersByState(noneInactive, 'INACTIVE')).toHaveLength(0);
  });

  it('counts every state for the chips, including the empty ones', () => {
    const counts = countMembersByState(everyone);
    expect(counts).toEqual({ all: 5, INACTIVE: 1, WATCH: 1, ACTIVE: 2, NEW: 1 });
    const counts2 = countMembersByState([]);
    expect(counts2.WATCH).toBe(0);
    expect(counts2.all).toBe(0);
  });

  it('falls back to all for an unknown, missing or repeated filter in the URL', () => {
    expect(parseMemberStateFilter(undefined)).toBe('all');
    expect(parseMemberStateFilter('nonsense')).toBe('all');
    expect(parseMemberStateFilter('inactive')).toBe('all');
    expect(parseMemberStateFilter('INACTIVE')).toBe('INACTIVE');
    expect(parseMemberStateFilter(['WATCH', 'ACTIVE'])).toBe('WATCH');
  });
});

// ---------------------------------------------------------------------
// The test-account toggle and the range, carried through every link
// ---------------------------------------------------------------------

describe('the test-account toggle applies here identically', () => {
  it('rides along on the table link, the filter chips and the member links', () => {
    const on = parseDashboardView({ range: '7d', test: 'on' }, TODAY);
    expect(membersTableHref(on)).toContain('test=on');
    expect(membersTableHref(on, 'WATCH')).toContain('test=on');
    expect(membersTableHref(on, 'WATCH')).toContain('state=WATCH');
    expect(memberDetailHref('abc', on)).toContain('test=on');
  });

  it('is absent from every link when it is off, never sent as test=off', () => {
    const off = parseDashboardView({ range: '7d' }, TODAY);
    expect(membersTableHref(off)).not.toContain('test');
    expect(membersTableHref(off, 'INACTIVE')).not.toContain('test');
    expect(memberDetailHref('abc', off)).not.toContain('test');
  });

  it('carries the date range onto a member and the state filter back off her', () => {
    const view = parseDashboardView({ range: 'custom', from: '2026-06-01', to: '2026-06-30' }, TODAY);
    const href = memberDetailHref('abc', view, { state: 'INACTIVE' });
    expect(href).toContain('range=custom');
    expect(href).toContain('from=2026-06-01');
    expect(href).toContain('to=2026-06-30');
    expect(href).toContain('state=INACTIVE');
    expect(membersTableHref(view, 'INACTIVE')).toContain('range=custom');
  });

  it('does not put a state parameter on the link for All members', () => {
    const view = parseDashboardView({ range: '30d' }, TODAY);
    expect(membersTableHref(view, 'all')).not.toContain('state=');
    expect(memberDetailHref('abc', view, { state: 'all' })).not.toContain('state=');
  });

  it('carries the before/after choices on a member link when they are set', () => {
    const view = parseDashboardView({ range: '30d' }, TODAY);
    const href = memberDetailHref('abc', view, { referenceDate: '2026-07-01', windowDays: 30 });
    expect(href).toContain('ref=2026-07-01');
    expect(href).toContain('window=30');
  });
});

// ---------------------------------------------------------------------
// The facts, in words
// ---------------------------------------------------------------------

describe('what a row says about a member', () => {
  it('says never active in those words rather than as a big number or a dash', () => {
    expect(daysAwayLabel(facts({ daysSinceLastActivity: null, lastActivityDate: null }))).toBe(
      'Never active'
    );
  });

  it('says today, one day, and many days, each in its own grammar', () => {
    expect(daysAwayLabel(facts({ daysSinceLastActivity: 0 }))).toBe('Today');
    expect(daysAwayLabel(facts({ daysSinceLastActivity: 1 }))).toBe('1 day');
    expect(daysAwayLabel(facts({ daysSinceLastActivity: 1400 }))).toBe('1,400 days');
  });

  it('refuses to invent a rhythm for a member who has not established one', () => {
    expect(rhythmLabel(facts({ typicalGapDays: null }))).toBe('Not known yet');
    expect(rhythmLabel(facts({ typicalGapDays: 1 }))).toBe('About every 1 day');
    expect(rhythmLabel(facts({ typicalGapDays: 3.5 }))).toBe('About every 3.5 days');
  });

  it('describes a never-used account as created and never used, not as zero history', () => {
    const line = historyLabel(
      facts({ historyDays: null, lastActivityDate: null, daysSinceAccountCreated: 40 })
    );
    expect(line).toContain('never used');
    expect(line).not.toContain('0 days of history');
  });

  it('falls back to a short id rather than a blank when a member has no display name', () => {
    expect(memberName({ displayName: null, memberId: 'abcdef12-0000-0000-0000-000000000000' })).toBe(
      'Member abcdef12'
    );
    expect(memberName({ displayName: '   ', memberId: 'abcdef12-0000-0000-0000-000000000000' })).toBe(
      'Member abcdef12'
    );
    expect(memberName({ displayName: 'Real Name', memberId: 'x' })).toBe('Real Name');
  });
});

describe('how the state was decided is shown, never hidden', () => {
  it('uses the service layer tokens verbatim for every basis it can return', () => {
    const bases: EngagementBasis[] = [
      'self_comparison',
      'fixed_thresholds',
      'new_member',
      'never_active',
    ];
    for (const basis of bases) {
      expect(ENGAGEMENT_BASIS_LABEL[basis]).toBe(basis);
      expect(ENGAGEMENT_BASIS_MEANING[basis].length).toBeGreaterThan(20);
    }
  });

  it('says what self-comparison and the fixed thresholds actually are', () => {
    expect(ENGAGEMENT_BASIS_MEANING.self_comparison).toContain('42 days');
    expect(ENGAGEMENT_BASIS_MEANING.fixed_thresholds).toContain('7 days');
    expect(ENGAGEMENT_BASIS_MEANING.fixed_thresholds).toContain('21 days');
  });
});

// ---------------------------------------------------------------------
// Signals as coaching cues
// ---------------------------------------------------------------------

describe('a signal renders as an observation, never as advice', () => {
  it('has a neutral title for every signal type the service layer can raise', () => {
    const types: FrictionSignalType[] = [
      'repeated_incomplete_flow',
      'onboarding_not_completed',
      'viewed_without_engaging',
      'opened_once_not_revisited',
      'feature_use_declined',
      'overall_activity_declined',
      'long_absence',
      'returned_after_absence',
      'consistent_feature_use',
      'insufficient_behavioral_history',
    ];
    for (const type of types) {
      expect(SIGNAL_TITLE[type], type).toBeTruthy();
      expect(SIGNAL_TONE[type], type).toBeTruthy();
    }
  });

  it('never tells anybody what to do, and never says why she behaved that way', () => {
    const banned =
      /should|must |need to|try |recommend|suggest|reach out|because she|motivat|overwhelm|struggl|lazy|forgot|lost interest/i;
    for (const title of Object.values(SIGNAL_TITLE)) {
      expect(title, title).not.toMatch(banned);
    }
    for (const copy of Object.values(MEMBER_EMPTY_COPY)) {
      expect(copy.title, copy.title).not.toMatch(banned);
      expect(copy.body, copy.body).not.toMatch(banned);
    }
  });

  it('separates the signals that mean something is stuck from neutral context', () => {
    expect(isStuckSignal('long_absence')).toBe(true);
    expect(isStuckSignal('onboarding_not_completed')).toBe(true);
    expect(isStuckSignal('consistent_feature_use')).toBe(false);
    expect(isStuckSignal('returned_after_absence')).toBe(false);
    expect(isStuckSignal('insufficient_behavioral_history')).toBe(false);
    expect(SIGNAL_TONE.consistent_feature_use).toBe('context');
    expect(SIGNAL_TONE.long_absence).toBe('friction');
  });

  it('puts friction ahead of context, and keeps the service layer order inside each group', () => {
    const ordered = orderSignals([
      signal({ type: 'consistent_feature_use', reason: 'Habit.' }),
      signal({ type: 'long_absence', reason: 'Away.' }),
      signal({ type: 'returned_after_absence', reason: 'Back.' }),
      signal({ type: 'onboarding_not_completed', reason: 'Unfinished.' }),
    ]);
    expect(ordered.map((s) => s.type)).toEqual([
      'long_absence',
      'onboarding_not_completed',
      'consistent_feature_use',
      'returned_after_absence',
    ]);
  });
});

describe('the insufficient-history case', () => {
  it('is labelled in exactly the words the build requires', () => {
    expect(INSUFFICIENT_HISTORY_LABEL).toBe('Not enough history to say');
    expect(SIGNAL_TITLE.insufficient_behavioral_history).toBe(INSUFFICIENT_HISTORY_LABEL);
  });

  it('is recognised from the service layer type, not from the wording of a reason', () => {
    expect(isInsufficientHistory(signal({ type: 'insufficient_behavioral_history' }))).toBe(true);
    expect(isInsufficientHistory(signal({ type: 'long_absence' }))).toBe(false);
  });

  it('still shows its evidence, so thin reads as thin rather than as broken', () => {
    const thin = signal({
      type: 'insufficient_behavioral_history',
      evidence: { historyDays: 3, lifetimeActiveDays: 2, firstActivityDate: '2026-08-09' },
    });
    expect(evidenceEntries(thin)).toHaveLength(3);
    expect(signalPeriodLabel(thin, { start: '2026-07-01', end: TODAY }).detail).toContain(
      '2026-08-09'
    );
  });
});

describe('since when a signal was observed', () => {
  it('prefers the comparison period the service layer actually compared', () => {
    const withComparison = signal({
      type: 'overall_activity_declined',
      comparisonPeriod: {
        recent: { start: '2026-07-30', end: '2026-08-12', days: 14 },
        baseline: { start: '2026-07-02', end: '2026-07-29', days: 28 },
      },
    });
    const period = signalPeriodLabel(withComparison, { start: '2026-01-01', end: TODAY });
    expect(period.label).toContain('own earlier behavior');
    expect(period.detail).toContain('2026-07-02');
    expect(period.detail).toContain('2026-08-12');
  });

  it('falls back to the earliest real date in the evidence', () => {
    const period = signalPeriodLabel(
      signal({
        type: 'viewed_without_engaging',
        evidence: { views: 4, firstViewDate: '2026-07-04', lastViewDate: '2026-08-01' },
      }),
      { start: '2026-01-01', end: TODAY }
    );
    expect(period.label).toBe('Observed since');
    expect(period.detail).toBe('2026-07-04, most recently 2026-08-01.');
  });

  it('falls back to the selected window, never to a guess, when there is no date at all', () => {
    const period = signalPeriodLabel(
      signal({ evidence: { startedEvents: 5, completedEvents: 1 } }),
      { start: '2026-07-01', end: TODAY }
    );
    expect(period.label).toBe('Observed over');
    expect(period.detail).toContain('2026-07-01');
    expect(period.detail).toContain(TODAY);
  });
});

describe('the evidence counts', () => {
  it('makes a key readable without a hand-written table that could drift', () => {
    expect(evidenceLabel('startedEvents')).toBe('Started events');
    expect(evidenceLabel('daysSinceLastActivity')).toBe('Days since last activity');
    expect(evidenceLabel('feature_key')).toBe('Feature key');
  });

  it('says a missing value in words rather than leaving an empty cell', () => {
    expect(evidenceValue(null)).toBe('Not recorded');
    expect(evidenceValue(0)).toBe('0');
    expect(evidenceValue(1234)).toBe('1,234');
    expect(evidenceValue(0.4567)).toBe('0.457');
    expect(evidenceValue('2026-08-01')).toBe('2026-08-01');
  });

  it('drops the member id, which is how the query was scoped and not evidence of anything she did', () => {
    const entries = evidenceEntries(
      signal({ evidence: { memberId: 'abc', startedEvents: 5 } })
    );
    expect(entries.map(([key]) => key)).toEqual(['startedEvents']);
  });
});

// ---------------------------------------------------------------------
// Before and after
// ---------------------------------------------------------------------

describe('the before/after controls', () => {
  const view = parseDashboardView({ range: '90d' }, TODAY);

  it('defaults to a reference date one whole window before the end of the range', () => {
    const controls = parseComparisonControls(undefined, view);
    expect(controls.windowDays).toBe(14);
    expect(controls.referenceDate).toBe('2026-07-29');
    expect(controls.notice).toBeNull();
  });

  it('accepts the window lengths it offers and ignores anything else', () => {
    for (const days of COMPARISON_WINDOW_CHOICES) {
      expect(parseComparisonControls({ window: String(days) }, view).windowDays).toBe(days);
    }
    expect(parseComparisonControls({ window: '13' }, view).windowDays).toBe(14);
    expect(parseComparisonControls({ window: 'abc' }, view).windowDays).toBe(14);
  });

  it('moves the default reference date with the chosen window, so the after window still completes', () => {
    expect(parseComparisonControls({ window: '30' }, view).referenceDate).toBe('2026-07-13');
    expect(parseComparisonControls({ window: '7' }, view).referenceDate).toBe('2026-08-05');
  });

  it('uses the reference date it was given', () => {
    const controls = parseComparisonControls({ ref: '2026-06-15' }, view);
    expect(controls.referenceDate).toBe('2026-06-15');
    expect(controls.notice).toBeNull();
  });

  it('says so rather than silently showing a different date it was not asked for', () => {
    const unreadable = parseComparisonControls({ ref: 'last tuesday' }, view);
    expect(unreadable.referenceDate).toBe('2026-07-29');
    expect(unreadable.notice).toContain('could not be read');

    const future = parseComparisonControls({ ref: '2027-01-01' }, view);
    expect(future.referenceDate).toBe('2026-07-29');
    expect(future.notice).toContain('after today');
  });
});

describe('the before/after readout', () => {
  it('shows both sides and the direction of the difference', () => {
    const rows = beforeAfterRows(comparison());
    const activeDays = rows.find((row) => row.metric === 'activeDays')!;
    expect(activeDays.label).toBe('Days she opened the app');
    expect(activeDays.before).toBe('4');
    expect(activeDays.after).toBe('8');
    expect(activeDays.change).toBe('Up 4');
  });

  it('says up from none rather than an infinite percentage', () => {
    const rows = beforeAfterRows(
      comparison({
        before: windowMetrics({ dailyResetStarted: 0 }),
        after: windowMetrics({ dailyResetStarted: 5 }),
      })
    );
    expect(rows.find((row) => row.metric === 'dailyResetStarted')!.change).toBe('Up from none');
  });

  it('says down to none rather than a minus one hundred percent', () => {
    const rows = beforeAfterRows(
      comparison({
        before: windowMetrics({ dailyResetStarted: 4 }),
        after: windowMetrics({ dailyResetStarted: 0 }),
      })
    );
    expect(rows.find((row) => row.metric === 'dailyResetStarted')!.change).toBe('Down to none');
  });

  it('shows no change as no change, not as a zero percent movement', () => {
    const rows = beforeAfterRows(
      comparison({ before: windowMetrics(), after: windowMetrics() })
    );
    expect(rows.find((row) => row.metric === 'activeDays')!.change).toBe('No change');
  });

  it('reads a null rate as not measured, never as zero', () => {
    const rows = beforeAfterRows(
      comparison({
        before: windowMetrics({ dailyResetCompletionRate: null }),
        after: windowMetrics({ dailyResetCompletionRate: null }),
      })
    );
    const row = rows.find((r) => r.metric === 'dailyResetCompletionRate')!;
    expect(row.before).toBe('Not measured');
    expect(row.after).toBe('Not measured');
    expect(row.change).toBeNull();
  });

  it('formats a rate as a percentage and its movement in points', () => {
    const rows = beforeAfterRows(
      comparison({
        before: windowMetrics({ activeDayRate: 20 }),
        after: windowMetrics({ activeDayRate: 50 }),
      })
    );
    const row = rows.find((r) => r.metric === 'activeDayRate')!;
    expect(row.before).toBe('20%');
    expect(row.after).toBe('50%');
    expect(row.change).toBe('Up 30 points');
  });

  it('gives every metric a real label, never a raw key', () => {
    for (const row of beforeAfterRows(comparison())) {
      expect(row.label, row.metric).not.toBe(row.metric);
      expect(row.label.length).toBeGreaterThan(4);
    }
  });

  it('warns loudly when the after window has not finished elapsing', () => {
    expect(afterWindowNotice(comparison())).toBeNull();
    const notice = afterWindowNotice(
      comparison({ afterWindowComplete: false, daysOfAfterWindowElapsed: 3 })
    );
    expect(notice).toContain('3 of 14');
    expect(notice).toContain('not yet a decline');
  });
});

// ---------------------------------------------------------------------
// Empty and thin states
// ---------------------------------------------------------------------

describe('empty states are written, not shrugged', () => {
  it('every one says what will make it fill in, or why it is empty', () => {
    for (const [key, copy] of Object.entries(MEMBER_EMPTY_COPY)) {
      expect(copy.title.length, key).toBeGreaterThan(8);
      expect(copy.body.length, key).toBeGreaterThan(40);
    }
  });

  it('says an empty state filter is a real result rather than a missing one', () => {
    expect(MEMBER_EMPTY_COPY.noneInState.body).toContain('real result');
  });

  it('does not claim nothing is wrong when no signal was raised', () => {
    expect(MEMBER_EMPTY_COPY.noSignals.body).toContain('not a claim that nothing is wrong');
  });

  it('explains an out-of-scope id instead of showing an invented member', () => {
    expect(MEMBER_EMPTY_COPY.notInScope.body).toContain('test account');
    expect(MEMBER_EMPTY_COPY.notInScope.body).toContain('coach');
  });

  it('never prints a zero where a signal count was simply not taken', () => {
    expect(SIGNALS_NOT_COUNTED).toBe('Not counted');
    expect(SIGNAL_COUNT_NOTE).toContain('Watch or Inactive');
  });
});

// ---------------------------------------------------------------------
// The two screens, checked structurally
// ---------------------------------------------------------------------

describe('the two member screens', () => {
  it('each one calls the guard itself, not only the layout it happens to sit under', () => {
    for (const file of NEW_PAGE_FILES) {
      expect(source(file), file).toContain('await requireAnalyticsAdmin()');
    }
  });

  it('reads only through the authorized action layer, never the service layer directly', () => {
    for (const file of NEW_PAGE_FILES) {
      const text = source(file);
      expect(text, file).toContain('@/app/actions/analyticsAdmin');
      expect(text, file).not.toMatch(
        /from '@\/lib\/analytics-service\/(client|detections|queries|friction|timeline|comparison)'/
      );
      expect(text, file).not.toContain('createClient(');
    }
  });

  it('passes the parsed view straight to the service layer, so the label and the query agree', () => {
    for (const file of NEW_PAGE_FILES) {
      expect(source(file), file).toContain('analyticsOptionsFor(view)');
    }
  });

  it('has an honest empty state and tells a refused query apart from an empty one', () => {
    for (const file of NEW_PAGE_FILES) {
      expect(source(file), file).toContain('EmptyState');
      expect(source(file), file).toContain('ActionError');
    }
  });

  it('opens no data source of its own on the member detail: only the three analytics actions', () => {
    const detail = source('app/admin/analytics/members/[memberId]/page.tsx');
    const imports = detail.split('\n').filter((line) => line.trim().startsWith('import'));
    for (const line of imports) {
      expect(line, line).not.toMatch(
        /@\/lib\/(supabase|coaching-engine|correlation|checkin|drivers|feed|priority|assessment)/
      );
    }
    expect(detail).toContain('getMemberFrictionSignalsAction');
    expect(detail).toContain('getMemberActivityTimelineAction');
    expect(detail).toContain('getMemberWindowComparisonAction');
  });

  it('names no health field anywhere in the section', () => {
    const banned =
      /pain_location|sleep_quality|energy_level|stress_level|check_?in_?answer|questionnaire_response|symptom|readiness_score|root_score|hydration|nutrition_detail/i;
    for (const file of NEW_SECTION_FILES) {
      expect(source(file), file).not.toMatch(banned);
    }
  });

  it('uses no LLM anywhere: every number and label is deterministic', () => {
    for (const file of NEW_SECTION_FILES) {
      const imports = source(file)
        .split('\n')
        .filter((line) => line.includes("from '") || line.includes('require('));
      for (const line of imports) {
        expect(line, `${file}: ${line}`).not.toMatch(/anthropic|openai|\/ai(-|\/)|ai-dispatcher/i);
      }
      expect(source(file), file).not.toMatch(/generateText\(|callModel\(|dispatchAi\(/);
    }
  });

  it('writes no em dash in any on-screen copy', () => {
    for (const file of NEW_SECTION_FILES) {
      expect(source(file), file).not.toContain('—');
    }
  });

  it('never loads raw event rows into the browser: nothing new here is a client component', () => {
    for (const file of NEW_SECTION_FILES) {
      expect(source(file), file).not.toContain("'use client'");
    }
  });

  it('keeps the timeline aggregation on the server: the action returns counts, not rows', () => {
    const timeline = source('lib/analytics-service/timeline.ts');
    expect(timeline).toContain('getMemberEngagementFacts');
    // The scope and authorization check has to run before any row is read.
    expect(timeline.indexOf('getMemberEngagementFacts')).toBeLessThan(
      timeline.indexOf("from('product_analytics_events')")
    );
    expect(timeline).toContain('TIMELINE_ROW_CAP');
  });
});
