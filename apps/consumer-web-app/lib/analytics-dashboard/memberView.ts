/**
 * The member engagement views' rules, in one pure module.
 *
 * No I/O, no Supabase client, no React, no LLM. Everything the engagement
 * table and the member detail decide about ordering, filtering, wording and
 * honesty is here so it can be tested without a database, exactly as
 * viewState.ts, trend.ts and presentation.ts already are for the first four
 * screens.
 *
 * THE RULES THIS FILE EXISTS TO HOLD.
 *
 * 1. NOTHING HERE CLASSIFIES ANYBODY. The state, the basis, the reason and
 *    every friction signal arrive already decided by
 *    lib/analytics-service/. This module orders them, filters them and
 *    labels them. It never re-derives a state, never invents a threshold,
 *    and never softens or rewrites a reason: a signal's own sentence is
 *    rendered verbatim.
 *
 * 2. THE BASIS IS SHOWN, NEVER HIDDEN. A state decided by comparing a
 *    member against her own baseline and a state decided by a fixed 7 and
 *    21 day threshold are different claims, and the second is much weaker.
 *    The service layer's own token is shown alongside the plain-language
 *    expansion so the two can never drift apart.
 *
 * 3. AN OBSERVATION IS NOT A RECOMMENDATION. A signal card says what was
 *    observed, since when, and the counts behind it. It never says what to
 *    do, and it never says why she behaved that way, because why is not in
 *    the data.
 *
 * 4. THIN DATA READS AS THIN, NOT AS BROKEN. With current usage most
 *    members will be decided on fixed thresholds and most detail pages will
 *    carry a single "not enough history to say" card. That is the truth, and
 *    it is designed as carefully as a populated screen.
 */

import type {
  EngagementBasis,
  EngagementState,
  FrictionSignal,
  FrictionSignalType,
  MemberEngagementFacts,
  MemberWindowComparison,
} from '@/lib/analytics-service';
import { compareWindows, isCalendarDate, shiftCalendarDate } from '@/lib/analytics-service';
import { formatCount, formatRate } from './presentation';
import { dashboardHref } from './viewState';
import type { DashboardView } from './viewState';

export const MEMBERS_TABLE_PATH = '/admin/analytics/members';

// ---------------------------------------------------------------------
// States: ordering and filtering
// ---------------------------------------------------------------------

/**
 * Most in need of attention first. INACTIVE, then WATCH, then ACTIVE, as
 * the build requires.
 *
 * NEW is the service layer's fourth state and it sorts last, below ACTIVE.
 * A member whose first activity was four days ago has not disengaged, she
 * has not had time to establish anything to disengage from, and putting her
 * above a member who has genuinely stopped would push the real absences
 * down the list. She is listed, never hidden.
 */
export const ENGAGEMENT_STATE_ORDER: EngagementState[] = ['INACTIVE', 'WATCH', 'ACTIVE', 'NEW'];

export const ENGAGEMENT_STATE_LABEL: Record<EngagementState, string> = {
  INACTIVE: 'Inactive',
  WATCH: 'Watch',
  ACTIVE: 'Active',
  NEW: 'New',
};

/** What each state means, in the service layer's own terms. Shown next to the filter, so a state is never a bare word. */
export const ENGAGEMENT_STATE_MEANING: Record<EngagementState, string> = {
  INACTIVE: 'Away longer than her own pattern allows for, or longer than the fixed threshold.',
  WATCH: 'Still here, at less than half her own usual rate, or 8 to 21 days away.',
  ACTIVE: 'Visiting in line with her own pattern, or within the last 7 days.',
  NEW: 'Too early to compare her against a pattern she has not had time to build.',
};

/**
 * The service layer's own token for how the state was decided, shown
 * verbatim, and what it means in plain language.
 */
export const ENGAGEMENT_BASIS_LABEL: Record<EngagementBasis, string> = {
  self_comparison: 'self_comparison',
  fixed_thresholds: 'fixed_thresholds',
  new_member: 'new_member',
  never_active: 'never_active',
};

export const ENGAGEMENT_BASIS_MEANING: Record<EngagementBasis, string> = {
  self_comparison:
    'Compared against her own baseline: at least 42 days of history and at least 4 active days in the baseline window.',
  fixed_thresholds:
    'Not enough of her own history to have a baseline, so the fixed thresholds were used: active within 7 days, 8 to 21 days, or longer.',
  new_member: 'Her first activity was within the last 14 days, so there is no baseline to compare against.',
  never_active: 'No app activity has been recorded for her at all.',
};

export type MemberStateFilter = 'all' | EngagementState;

export const MEMBER_STATE_FILTERS: MemberStateFilter[] = ['all', ...ENGAGEMENT_STATE_ORDER];

export const MEMBER_STATE_FILTER_LABEL: Record<MemberStateFilter, string> = {
  all: 'All members',
  INACTIVE: 'Inactive',
  WATCH: 'Watch',
  ACTIVE: 'Active',
  NEW: 'New',
};

export function parseMemberStateFilter(value: string | string[] | undefined): MemberStateFilter {
  const first = Array.isArray(value) ? value[0] : value;
  if (first && (MEMBER_STATE_FILTERS as string[]).includes(first)) return first as MemberStateFilter;
  return 'all';
}

/** Never active is the longest absence there is, so it sorts above every finite one. */
function absenceRank(days: number | null): number {
  return days === null ? Number.MAX_SAFE_INTEGER : days;
}

/**
 * Most in need of attention first: by state, and inside a state the longest
 * away first. Display name is the last tiebreak so the order is stable
 * between two renders of the same data rather than depending on the order
 * the database happened to return.
 */
export function sortMembersByAttention<T extends { state: EngagementState; facts: MemberEngagementFacts }>(
  members: T[]
): T[] {
  return [...members].sort((a, b) => {
    const byState =
      ENGAGEMENT_STATE_ORDER.indexOf(a.state) - ENGAGEMENT_STATE_ORDER.indexOf(b.state);
    if (byState !== 0) return byState;
    const byAbsence =
      absenceRank(b.facts.daysSinceLastActivity) - absenceRank(a.facts.daysSinceLastActivity);
    if (byAbsence !== 0) return byAbsence;
    return (a.facts.displayName ?? a.facts.memberId).localeCompare(
      b.facts.displayName ?? b.facts.memberId
    );
  });
}

export function filterMembersByState<T extends { state: EngagementState }>(
  members: T[],
  filter: MemberStateFilter
): T[] {
  if (filter === 'all') return members;
  return members.filter((member) => member.state === filter);
}

// ---------------------------------------------------------------------
// Sorting the table
// ---------------------------------------------------------------------

/**
 * The columns the table can be ordered by.
 *
 * `attention` is the default and is the ordering the build originally
 * specified: state first, longest away inside a state. The rest exist
 * because an administrator scanning the table has other real questions
 * ("who joined and never came back", "whose rhythm is fastest"), and every
 * one of them is a plain reordering of facts already on the row. No sort
 * computes anything, and no sort can change which members are listed.
 */
export type MemberSortKey = 'attention' | 'name' | 'lastActive' | 'state' | 'rhythm' | 'signals';

export const MEMBER_SORT_KEYS: MemberSortKey[] = [
  'attention',
  'name',
  'lastActive',
  'state',
  'rhythm',
  'signals',
];

export const DEFAULT_MEMBER_SORT: MemberSortKey = 'attention';

export const MEMBER_SORT_LABEL: Record<MemberSortKey, string> = {
  attention: 'Most in need of attention',
  name: 'Name',
  lastActive: 'Longest since last active',
  state: 'Engagement state',
  rhythm: 'Return frequency',
  signals: 'Most friction signals',
};

/**
 * What each ordering actually does, said on the screen. A sort control with
 * no explanation invites an administrator to read the top row as "worst",
 * which is only true for one of these.
 */
export const MEMBER_SORT_MEANING: Record<MemberSortKey, string> = {
  attention:
    'Inactive first, then Watch, then Active, then New, and inside each of those the longest away first.',
  name: 'Alphabetical by display name. A member with no name on file sorts by her id.',
  lastActive:
    'Longest absence first. Never active counts as the longest absence there is, so those members sort above every finite one.',
  state: 'Grouped by state in the same order as above, then alphabetically inside each state.',
  rhythm:
    'Fastest known rhythm first. A member with no known rhythm has no gap to sort by and is placed last rather than given an invented one.',
  signals:
    'Most raised signals first. Members whose signals were not counted are placed last, because an uncounted member is not the same as a member with none.',
};

export function parseMemberSort(value: string | string[] | undefined): MemberSortKey {
  const first = Array.isArray(value) ? value[0] : value;
  if (first && (MEMBER_SORT_KEYS as string[]).includes(first)) return first as MemberSortKey;
  return DEFAULT_MEMBER_SORT;
}

type SortableMember = { state: EngagementState; facts: MemberEngagementFacts };

/** Display name, or the id when there is no name, so the tiebreak is always defined. */
function nameKey(member: SortableMember): string {
  return (member.facts.displayName ?? member.facts.memberId).toLowerCase();
}

/** A member with no known rhythm has nothing to compare, so she goes last rather than being treated as gap zero. */
function rhythmRank(facts: MemberEngagementFacts): number {
  const gap = facts.typicalGapDays;
  if (gap === null || !Number.isFinite(gap)) return Number.MAX_SAFE_INTEGER;
  return gap;
}

/**
 * Orders the table.
 *
 * `signalCounts` only has entries for members the follow-up shortlist
 * actually ran over. A member missing from it was never counted, which is a
 * different fact from having zero signals, so she sorts below every counted
 * member instead of being ranked as a zero.
 *
 * Every branch ends in the same name tiebreak, so two renders of the same
 * data always produce the same order rather than depending on the order the
 * database happened to return.
 */
export function sortMembers<T extends SortableMember>(
  members: T[],
  sort: MemberSortKey,
  signalCounts?: Map<string, number>
): T[] {
  if (sort === 'attention') return sortMembersByAttention(members);

  const byName = (a: T, b: T) => nameKey(a).localeCompare(nameKey(b));

  return [...members].sort((a, b) => {
    switch (sort) {
      case 'name':
        return byName(a, b);
      case 'lastActive': {
        const byAbsence =
          absenceRank(b.facts.daysSinceLastActivity) - absenceRank(a.facts.daysSinceLastActivity);
        return byAbsence !== 0 ? byAbsence : byName(a, b);
      }
      case 'state': {
        const byState =
          ENGAGEMENT_STATE_ORDER.indexOf(a.state) - ENGAGEMENT_STATE_ORDER.indexOf(b.state);
        return byState !== 0 ? byState : byName(a, b);
      }
      case 'rhythm': {
        const byRhythm = rhythmRank(a.facts) - rhythmRank(b.facts);
        return byRhythm !== 0 ? byRhythm : byName(a, b);
      }
      case 'signals': {
        const counted = (member: T) => signalCounts?.has(member.facts.memberId) === true;
        if (counted(a) !== counted(b)) return counted(a) ? -1 : 1;
        const countOf = (member: T) => signalCounts?.get(member.facts.memberId) ?? 0;
        const byCount = countOf(b) - countOf(a);
        return byCount !== 0 ? byCount : byName(a, b);
      }
      default:
        return byName(a, b);
    }
  });
}

/** How many members are in each state, for the filter chips. Every state is counted, including the empty ones. */
export function countMembersByState<T extends { state: EngagementState }>(
  members: T[]
): Record<MemberStateFilter, number> {
  const counts: Record<MemberStateFilter, number> = {
    all: members.length,
    INACTIVE: 0,
    WATCH: 0,
    ACTIVE: 0,
    NEW: 0,
  };
  for (const member of members) counts[member.state] += 1;
  return counts;
}

// ---------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------

/**
 * Every link inside the member views carries the range and the test-account
 * toggle through dashboardHref, exactly as the first four screens do, so
 * opening a member and coming back never silently changes the window her
 * numbers were read over.
 */
export function membersTableHref(
  view: DashboardView,
  filter: MemberStateFilter = 'all',
  sort: MemberSortKey = DEFAULT_MEMBER_SORT
): string {
  const base = dashboardHref(MEMBERS_TABLE_PATH, view);
  let href = filter === 'all' ? base : `${base}&state=${filter}`;
  if (sort !== DEFAULT_MEMBER_SORT) href += `&sort=${sort}`;
  return href;
}

export function memberDetailHref(
  memberId: string,
  view: DashboardView,
  extra: {
    state?: MemberStateFilter;
    sort?: MemberSortKey;
    referenceDate?: string;
    windowDays?: number;
  } = {}
): string {
  let href = dashboardHref(`${MEMBERS_TABLE_PATH}/${memberId}`, view);
  if (extra.state && extra.state !== 'all') href += `&state=${extra.state}`;
  if (extra.sort && extra.sort !== DEFAULT_MEMBER_SORT) href += `&sort=${extra.sort}`;
  if (extra.referenceDate) href += `&ref=${extra.referenceDate}`;
  if (extra.windowDays) href += `&window=${extra.windowDays}`;
  return href;
}

// ---------------------------------------------------------------------
// The facts, in words
// ---------------------------------------------------------------------

export function memberName(member: { displayName: string | null; memberId: string }): string {
  const name = member.displayName?.trim();
  if (name) return name;
  return `Member ${member.memberId.slice(0, 8)}`;
}

/**
 * How long she has been away. Never active is said in those words rather
 * than as a large number or a dash, because it is a different fact from a
 * long absence and the two must not look the same.
 */
export function daysAwayLabel(facts: MemberEngagementFacts): string {
  const days = facts.daysSinceLastActivity;
  if (days === null || facts.lastActivityDate === null) return 'Never active';
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return `${formatCount(days)} days`;
}

/**
 * Her usual rhythm, where it is known. The service layer only computes a
 * typical gap from real repeat visits, so a member without one is said to
 * have no known rhythm rather than being given an invented average.
 */
export function rhythmLabel(facts: MemberEngagementFacts): string {
  const gap = facts.typicalGapDays;
  if (gap === null || !Number.isFinite(gap)) return 'Not known yet';
  const shown = Number.isInteger(gap) ? String(gap) : gap.toFixed(1);
  return `About every ${shown} ${Number(shown) === 1 ? 'day' : 'days'}`;
}

/** The one line under a member's name on the table: what her history amounts to. */
export function historyLabel(facts: MemberEngagementFacts): string {
  if (facts.historyDays === null || facts.lastActivityDate === null) {
    return `Account created ${formatCount(facts.daysSinceAccountCreated)} ${
      facts.daysSinceAccountCreated === 1 ? 'day' : 'days'
    } ago, never used`;
  }
  return `${formatCount(facts.historyDays)} ${facts.historyDays === 1 ? 'day' : 'days'} of history, active on ${formatCount(facts.lifetimeActiveDays)} of them`;
}

// ---------------------------------------------------------------------
// Friction signals
// ---------------------------------------------------------------------

/**
 * A short, neutral name for a signal type. It names what was observed and
 * nothing else. No signal title says what to do about it, and none of them
 * says why.
 */
export const SIGNAL_TITLE: Record<FrictionSignalType, string> = {
  repeated_incomplete_flow: 'Started repeatedly, finished rarely',
  onboarding_not_completed: 'Onboarding never finished',
  viewed_without_engaging: 'Opened, nothing done inside',
  opened_once_not_revisited: 'Opened once, not opened again',
  feature_use_declined: 'One feature used less than before',
  overall_activity_declined: 'Visiting less than her own baseline',
  long_absence: 'Away longer than her own pattern',
  returned_after_absence: 'Came back after being away',
  consistent_feature_use: 'A habit that is holding',
  insufficient_behavioral_history: 'Not enough history to say',
};

/** The exact words the build requires wherever the service layer flags insufficient history. */
export const INSUFFICIENT_HISTORY_LABEL = 'Not enough history to say';

export function isInsufficientHistory(signal: { type: FrictionSignalType }): boolean {
  return signal.type === 'insufficient_behavioral_history';
}

/**
 * Signals that describe something stuck, as opposed to neutral or positive
 * context. The same split lib/analytics-service/queries.ts uses for the
 * attention score, so the table's signal count and a coach follow-up
 * shortlist cannot disagree about what counts as friction.
 */
const STUCK_SIGNAL_TYPES: FrictionSignalType[] = [
  'repeated_incomplete_flow',
  'onboarding_not_completed',
  'viewed_without_engaging',
  'opened_once_not_revisited',
  'feature_use_declined',
  'overall_activity_declined',
  'long_absence',
];

export function isStuckSignal(type: FrictionSignalType): boolean {
  return STUCK_SIGNAL_TYPES.includes(type);
}

export const SIGNAL_TONE: Record<FrictionSignalType, 'friction' | 'context'> = {
  repeated_incomplete_flow: 'friction',
  onboarding_not_completed: 'friction',
  viewed_without_engaging: 'friction',
  opened_once_not_revisited: 'friction',
  feature_use_declined: 'friction',
  overall_activity_declined: 'friction',
  long_absence: 'friction',
  returned_after_absence: 'context',
  consistent_feature_use: 'context',
  insufficient_behavioral_history: 'context',
};

export const SUFFICIENCY_LABEL = {
  strong: 'Strong evidence',
  moderate: 'Moderate evidence',
  low: 'Little evidence',
} as const;

/**
 * Evidence sufficiency is how much behavior was observed before the
 * observation was made. It is not a confidence score about the member and
 * not a medical score, and the screen says so rather than leaving a bare
 * word to be read as either.
 */
export const SUFFICIENCY_NOTE =
  'Evidence sufficiency is how much behavior was actually observed before this was said. It is not a confidence score about the member and not a health measure.';

/** Evidence keys whose value is a calendar date, so a card can say since when. */
const DATE_EVIDENCE_KEYS = [
  'firstActivityDate',
  'firstViewDate',
  'accountCreatedDate',
  'lastStartedDate',
  'lastUsedDate',
  'lastViewDate',
  'lastCompletedDate',
  'lastActivityDate',
];

/**
 * The comparison period behind a signal, or the earliest date its own
 * evidence names, or the window the report was run over. In that order,
 * because the first is the period the service layer actually compared, the
 * second is a real date in the evidence, and the third is the only honest
 * answer left. Never a guess.
 */
export function signalPeriodLabel(
  signal: FrictionSignal,
  range: { start: string; end: string }
): { label: string; detail: string } {
  if (signal.comparisonPeriod) {
    const { recent, baseline } = signal.comparisonPeriod;
    return {
      label: 'Compared against her own earlier behavior',
      detail: `Recent: ${recent.start} to ${recent.end} (${recent.days} days). Baseline: ${baseline.start} to ${baseline.end} (${baseline.days} days).`,
    };
  }

  const dates = DATE_EVIDENCE_KEYS.map((key) => signal.evidence[key])
    .filter((value): value is string => typeof value === 'string' && isCalendarDate(value))
    .sort();

  if (dates.length > 0) {
    return {
      label: 'Observed since',
      detail:
        dates.length === 1
          ? `${dates[0]}.`
          : `${dates[0]}, most recently ${dates[dates.length - 1]}.`,
    };
  }

  return {
    label: 'Observed over',
    detail: `${range.start} to ${range.end}, the window selected above.`,
  };
}

/**
 * An evidence key, made readable. A mechanical transform of the key the
 * service layer used, deliberately: a hand-written table of prettier names
 * would drift the first time a signal gained a field, and a wrong label on
 * a number is worse than a plain one.
 */
export function evidenceLabel(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase()
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** An evidence value, made readable, with null said in words rather than shown as an empty cell. */
export function evidenceValue(value: string | number | null): string {
  if (value === null) return 'Not recorded';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? formatCount(value) : String(Math.round(value * 1000) / 1000);
  }
  return value;
}

/** The member id is how the query was scoped, not evidence of anything she did. */
export function evidenceEntries(signal: FrictionSignal): Array<[string, string | number | null]> {
  return Object.entries(signal.evidence).filter(([key]) => key !== 'memberId');
}

/** The signals a coach acts on first, then the context. Order inside each group is the service layer's own. */
export function orderSignals(signals: FrictionSignal[]): FrictionSignal[] {
  return [...signals].sort((a, b) => {
    const rank = (signal: FrictionSignal) => (SIGNAL_TONE[signal.type] === 'friction' ? 0 : 1);
    return rank(a) - rank(b);
  });
}

// ---------------------------------------------------------------------
// The before/after comparison
// ---------------------------------------------------------------------

/**
 * The reference date and window for the before/after comparison, from the
 * URL.
 *
 * The default reference date is the window length back from the end of the
 * range being viewed, so the after window has finished elapsing and the two
 * sides have the same number of days of opportunity. Defaulting to today
 * would show an after window with nothing in it yet, which reads as a
 * collapse whether or not anything collapsed.
 */
export const COMPARISON_WINDOW_CHOICES = [7, 14, 30] as const;

export type ComparisonControls = {
  referenceDate: string;
  windowDays: number;
  /** Set when what the URL asked for could not be used, so the screen can say so instead of quietly showing something else. */
  notice: string | null;
};

export function parseComparisonControls(
  params: Record<string, string | string[] | undefined> | undefined,
  view: DashboardView,
  defaultWindowDays = 14
): ComparisonControls {
  const raw = params ?? {};
  const first = (key: string): string | undefined => {
    const value = raw[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const requestedWindow = Number(first('window'));
  const windowDays = (COMPARISON_WINDOW_CHOICES as readonly number[]).includes(requestedWindow)
    ? requestedWindow
    : defaultWindowDays;

  const fallback = shiftCalendarDate(view.end, -windowDays);
  const requested = first('ref');
  let notice: string | null = null;
  let referenceDate = fallback;

  if (requested !== undefined && requested !== '') {
    if (!isCalendarDate(requested)) {
      notice = `That reference date could not be read, so this is ${fallback}, which is one full window before the end of the range above.`;
    } else if (requested > view.end) {
      notice = `A reference date after today has no window after it, so this is ${fallback} instead.`;
    } else {
      referenceDate = requested;
    }
  }

  return { referenceDate, windowDays, notice };
}

export type ComparisonRow = {
  metric: string;
  label: string;
  before: string;
  after: string;
  /** Plain language for the difference. Null when there is no honest one to give. */
  change: string | null;
};

const COMPARISON_METRIC_LABEL: Record<string, string> = {
  activeDays: 'Days she opened the app',
  activeDayRate: 'Share of days she opened the app',
  signIns: 'Sign-ins',
  dailyResetStarted: 'Daily Resets started',
  dailyResetCompleted: 'Daily Resets completed',
  dailyResetCompletionRate: 'Daily Reset completion rate',
  totalEvents: 'Recorded actions',
  averageDaysBetweenVisits: 'Average days between visits',
};

const RATE_METRICS = new Set([
  'activeDayRate',
  'dailyResetCompletionRate',
]);

/**
 * The two sides and the difference between them, in words.
 *
 * A null on either side stays "not measured", never zero: the service layer
 * returns null for a rate whose denominator was zero, and printing that as
 * 0 percent would claim a failure that did not happen. Going from nothing to
 * something is said in those words rather than as an infinite increase,
 * mirroring compareWindows returning null rather than Infinity.
 */
export function beforeAfterRows(comparison: MemberWindowComparison): ComparisonRow[] {
  return compareWindows(comparison).map((delta) => {
    const isRate = RATE_METRICS.has(delta.metric);
    const format = (value: number | null): string => {
      if (value === null) return 'Not measured';
      if (isRate) return formatRate(value) ?? 'Not measured';
      return Number.isInteger(value) ? formatCount(value) : String(Math.round(value * 10) / 10);
    };

    let change: string | null = null;
    if (delta.before !== null && delta.after !== null) {
      if (delta.change === 0) {
        change = 'No change';
      } else if (delta.before === 0) {
        change = 'Up from none';
      } else if (delta.after === 0) {
        change = 'Down to none';
      } else if (delta.change !== null) {
        const direction = delta.change > 0 ? 'Up' : 'Down';
        const size = Math.abs(delta.change);
        change = `${direction} ${isRate ? `${Math.round(size * 10) / 10} points` : formatCount(size)}`;
      }
    }

    return {
      metric: delta.metric,
      label: COMPARISON_METRIC_LABEL[delta.metric] ?? evidenceLabel(delta.metric),
      before: format(delta.before),
      after: format(delta.after),
      change,
    };
  });
}

/**
 * The warning that has to sit on an incomplete after window. An after window
 * that has not finished elapsing has fewer days of opportunity than the
 * before window, so it will look like a decline whether or not anything
 * declined.
 */
export function afterWindowNotice(comparison: MemberWindowComparison): string | null {
  if (comparison.afterWindowComplete) return null;
  return `The after window has not finished yet: ${comparison.daysOfAfterWindowElapsed} of ${comparison.windowDays} days have elapsed. It has fewer days of opportunity than the before window, so a smaller number here is not yet a decline.`;
}

// ---------------------------------------------------------------------
// Empty and thin states
// ---------------------------------------------------------------------

export const MEMBER_EMPTY_COPY = {
  noMembers: {
    title: 'No members are in scope',
    body: 'This lists every account that is not a test account and holds no coach, administrator or clinician role. It fills in as real members are created. Turn on test accounts above to see the shape of a populated table.',
  },
  noneInState: {
    title: 'No member is in this state',
    body: 'That is a real result, not a missing one. Choose another state, or All members, to see who is here.',
  },
  noSignals: {
    title: 'No friction signal was raised in this window',
    body: 'Nothing she did in this window matched any of the behavioral patterns this layer can detect. That is not a claim that nothing is wrong, only that nothing observable is.',
  },
  noTimeline: {
    title: 'Nothing was recorded in this window',
    body: 'This fills in with the days she opened the app, which features she used, and what she started and finished. Widen the date range above to look further back.',
  },
  notInScope: {
    title: 'This id is not an in-scope member',
    body: 'It may be a test account while test accounts are excluded, a coach or administrator account, or an id that does not exist. Turn on test accounts above if you were looking for a test account.',
  },
  comparisonNotInScope: {
    title: 'No before and after for this id',
    body: 'The comparison only runs for an in-scope member, by the same definition the rest of this section uses.',
  },
} as const;

/** The sentence under the signal count column, so an uncounted member is never read as a member with no signals. */
export const SIGNAL_COUNT_NOTE =
  'Friction signals are counted for members already in a Watch or Inactive state, which is where the service layer runs the per-member checks. An Active or New member shows her count when you open her detail.';

/** Said wherever a signal count is genuinely not known, rather than printing a zero. */
export const SIGNALS_NOT_COUNTED = 'Not counted';
