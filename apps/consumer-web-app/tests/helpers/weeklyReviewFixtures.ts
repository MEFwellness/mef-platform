/**
 * The Weekly Root Review's test fixtures, shared by the composer, focus,
 * privacy and delivery suites.
 *
 * One file rather than five copies, so a change to what "a rich week" means
 * changes every suite's idea of it at once. Every fixture is real data in the
 * shapes the publishing systems genuinely produce: a LongitudinalSignal as
 * member_pattern_states stores it, a ledger row as
 * member_coaching_decisions stores it, a friction input as Part 1's own read
 * path returns it, and a plan week as the Reset Plan's own classifier
 * returns it.
 */

import type { WeeklyReviewInputs, ReviewDecision } from '@/lib/weekly-review/compose';
import type { LongitudinalSignal } from '@/lib/longitudinal-intelligence/types';
import { addCalendarDays, reviewedRangeFor } from '@/lib/weekly-review/week';

/** A real Monday. The review composed on it looks back at 2026-08-03..2026-08-09. */
export const WEEK_START = '2026-08-10';

const RANGE = reviewedRangeFor(WEEK_START);

/**
 * Openers the three-tier language module uses at tier 1 and tier 3
 * (lib/longitudinal-intelligence/copy.ts). Copied here deliberately, as the
 * OBSERVABLE surface the tier tests assert against: if that module changed
 * its wording, these tests should fail loudly rather than silently pass by
 * importing whatever it says today.
 */
export const TIER_1_MARKERS = [
  'You mentioned this once',
  'We noticed this once',
  'This may be worth watching',
];

export const TIER_3_MARKERS = [
  'A consistent pattern is emerging',
  'This has repeatedly appeared alongside your recent history',
  'Based on your recent history, this looks steady',
];

/** `count` consecutive local dates inside the reviewed week, ending on its last day. */
export function resetsInReviewedWeek(count: number): string[] {
  return Array.from({ length: count }, (_, index) => addCalendarDays(RANGE.to, -index));
}

/** `count` dates spread backwards from `from`, one per day. */
export function datesBackFrom(from: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addCalendarDays(from, -index));
}

export function signal(overrides: Partial<LongitudinalSignal> = {}): LongitudinalSignal {
  return {
    signalKey: 'checkin_metric::energy',
    signalKind: 'checkin_metric',
    signalLabel: 'energy',
    state: 'improving',
    tier: 3,
    occurrenceCount: 6,
    confidence: 0.84,
    firstObservedAt: '2026-06-01',
    lastObservedAt: '2026-08-09',
    evidenceSummary: {},
    ...overrides,
  };
}

export function decision(overrides: Partial<ReviewDecision> = {}): ReviewDecision {
  return {
    localDate: RANGE.to,
    rule: 'qualified_pattern',
    actionType: 'reflection',
    threadKey: 'qualified_pattern::sleep_hours::next_day_energy',
    memberResponse: 'done',
    ...overrides,
  };
}

export function emptyInputs(): WeeklyReviewInputs {
  return {
    weekStart: WEEK_START,
    checkinLocalDates: [],
    decisions: [],
    patternStates: [],
    planWeek: null,
    friction: null,
  };
}

/**
 * A member below either thin threshold. `resets` is her all-time Daily Reset
 * count and `spanDays` is how far back the first of them sits, so a caller
 * can cross one threshold without crossing the other.
 */
export function thinMember({
  resets,
  spanDays,
}: {
  resets: number;
  spanDays: number;
}): WeeklyReviewInputs {
  // The first reset sits `spanDays - 1` days before the end of the reviewed
  // week, so historyDaysFor returns exactly spanDays.
  const first = addCalendarDays(RANGE.to, -(spanDays - 1));
  const dates =
    resets === 0
      ? []
      : [first, ...Array.from({ length: resets - 1 }, (_, i) => addCalendarDays(first, i + 1))];
  return { ...emptyInputs(), checkinLocalDates: dates };
}

/**
 * A full week with something in every source: real consistency, a tier 3
 * improving direction, an active plan she returned to, and a ledger she
 * acted on. No friction and no conflicting state, so it earns no question.
 */
export function richWeek(): WeeklyReviewInputs {
  return {
    weekStart: WEEK_START,
    checkinLocalDates: [...resetsInReviewedWeek(6), ...datesBackFrom(RANGE.from, 30)],
    decisions: [
      decision({ localDate: RANGE.from, memberResponse: 'done' }),
      decision({ localDate: addCalendarDays(RANGE.from, 2), memberResponse: 'help' }),
      decision({ localDate: RANGE.to, memberResponse: 'done' }),
    ],
    patternStates: [signal()],
    planWeek: {
      focusSignal: 'sleep',
      pattern: 'mixed_effort',
      normalCount: 3,
      difficultCount: 2,
      notTodayCount: 1,
      loggedCount: 6,
    },
    friction: null,
  };
}

/**
 * A full week where Root delivered three actions and none of them landed.
 * Deliberately keeps real consistency, so the test is about the LEDGER being
 * empty of outcomes rather than about the member being absent.
 */
export function ignoredWeek(): WeeklyReviewInputs {
  return {
    ...richWeek(),
    decisions: [
      decision({ localDate: RANGE.from, memberResponse: 'ignored' }),
      decision({ localDate: addCalendarDays(RANGE.from, 3), memberResponse: 'ignored' }),
      decision({ localDate: RANGE.to, memberResponse: 'ignored' }),
    ],
    planWeek: {
      focusSignal: 'sleep',
      pattern: 'mostly_not_today',
      normalCount: 0,
      difficultCount: 0,
      notTodayCount: 4,
      loggedCount: 4,
    },
    friction: null,
  };
}

/**
 * The same thread both acted on and ignored inside one week, which is the
 * only ledger shape that earns the `mixed_response` question.
 */
export function mixedWeek(): WeeklyReviewInputs {
  const thread = 'qualified_pattern::sleep_hours::next_day_energy';
  return {
    ...richWeek(),
    decisions: [
      decision({ localDate: RANGE.from, threadKey: thread, memberResponse: 'done' }),
      decision({ localDate: addCalendarDays(RANGE.from, 2), threadKey: thread, memberResponse: 'ignored' }),
      decision({ localDate: addCalendarDays(RANGE.from, 4), threadKey: thread, memberResponse: 'help' }),
      decision({ localDate: RANGE.to, threadKey: thread, memberResponse: 'ignored' }),
    ],
  };
}

/**
 * A week the three-tier language module put into its 'conflicting' state,
 * which is the only pattern-engine condition that earns a question.
 */
export function conflictingWeek(): WeeklyReviewInputs {
  return {
    ...richWeek(),
    patternStates: [
      signal({ signalKey: 'checkin_metric::energy', state: 'conflicting', tier: null }),
    ],
  };
}

/** A friction input in the shape Part 1's own read path returns. */
export function frictionInput(kind: 'daily_reset_incomplete' | 'food_logging_lapsed') {
  return {
    kind,
    signalType: kind === 'daily_reset_incomplete' ? 'repeated_incomplete_flow' : 'feature_use_declined',
    starts: kind === 'daily_reset_incomplete' ? 7 : null,
    completions: kind === 'daily_reset_incomplete' ? 2 : null,
    completionRate: kind === 'daily_reset_incomplete' ? 0.29 : null,
    savedCount: null,
    windowDays: null,
    evidenceSufficiency: 'sufficient',
  } as const;
}
