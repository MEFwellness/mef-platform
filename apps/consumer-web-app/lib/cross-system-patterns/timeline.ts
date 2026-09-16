/**
 * CHANGE OVER TIME, from the dated rows, said in the flattest language
 * this app has.
 *
 * WHAT IT DOES. For each signal that contributed to a pattern, it puts the
 * values in the order they were captured, so a coach reads "Often to
 * Sometimes to Rarely" rather than being told a direction and asked to
 * trust it. Then it says one neutral sentence about the pattern as a
 * whole.
 *
 * MOVEMENT IS OBSERVATIONAL, AND STRUCTURALLY SO. Every pattern level
 * sentence this file can produce is a FIXED STRING in the list below. None
 * of them interpolates a signal name, a body area or a body system, so
 * none of them can be made to say that one area's change produced
 * another's. That is not a rule somebody has to remember while editing
 * copy: there is no template here with a slot for a second thing.
 *
 * NOTHING IS A SCORE. The counts below are how many signals moved which
 * way. They are never added up, never averaged, never given an adjective
 * and never combined with a questionnaire percentage.
 */

import { sideLabelOf } from '@/lib/cross-system-signals/coachView';
import type { SignalRecord } from '@/lib/cross-system-signals/types';
import { TRAJECTORY_MAX_POINTS } from './constants';
import type {
  ContributingSignal,
  PatternMovement,
  SignalTrajectory,
  TrajectoryDirection,
  TrajectoryPoint,
} from './types';

/**
 * THE SIX SENTENCES, and there are no others.
 *
 * Two of them are the ones the brief names word for word. The other four
 * cover the cases those two would otherwise have to be stretched over, and
 * stretching them is how a neutral line becomes a claim: "several" said
 * about one signal is wrong about the member's own rows, and "more active"
 * said about a pattern where nothing moved is wrong about all of them.
 */
export const MOVEMENT_LINES = {
  quieter: 'Several signals within this pattern have become quieter.',
  oneQuieter: 'One signal within this pattern has become quieter.',
  louder: 'This pattern has become more active since the previous assessment.',
  mixed: 'Some signals within this pattern have become quieter and others have become more active.',
  steady: 'Nothing within this pattern has moved since the entries before it.',
  tooEarly: 'Each signal in this pattern has been recorded once, so there is nothing to compare yet.',
} as const;

/** Oldest first, by the day the row names and then by the instant behind it. */
function oldestFirst(a: SignalRecord, b: SignalRecord): number {
  if (a.capturedOn !== b.capturedOn) return a.capturedOn < b.capturedOn ? -1 : 1;
  if (a.capturedAt !== b.capturedAt) return a.capturedAt < b.capturedAt ? -1 : 1;
  return 0;
}

/**
 * Which way the latest value moved against the one before it.
 *
 * 'unknown' where either row carries no comparable number, because a
 * presence and a band percentage are not on one ladder and pretending
 * otherwise would manufacture a direction out of two incomparable things.
 */
export function directionOf(points: readonly TrajectoryPoint[]): TrajectoryDirection {
  if (points.length < 2) return 'unknown';
  const latest = points[points.length - 1]!;
  const previous = points[points.length - 2]!;
  if (latest.valueNumeric === null || previous.valueNumeric === null) return 'unknown';
  if (latest.valueNumeric < previous.valueNumeric) return 'quieter';
  if (latest.valueNumeric > previous.valueNumeric) return 'louder';
  return 'steady';
}

/**
 * One contributing signal's whole history, oldest first.
 *
 * The history is every row this member has for that standardized signal
 * AND that side, which is the same grouping the coach's Signals list and
 * the matcher both use. The last few are printed rather than all of them,
 * because a line a coach cannot read at a glance is not a trajectory.
 */
export function buildTrajectory(
  contribution: ContributingSignal,
  records: readonly SignalRecord[]
): SignalTrajectory {
  const slug = contribution.record.signalSlug;
  const side = contribution.record.side ?? null;
  const history = records
    .filter((record) => record.signalSlug === slug && (record.side ?? null) === side)
    .sort(oldestFirst);

  const points: TrajectoryPoint[] = history.map((record) => ({
    valueLabel: record.valueLabel,
    valueNumeric: record.valueNumeric,
    capturedOn: record.capturedOn,
  }));
  const shown = points.slice(-TRAJECTORY_MAX_POINTS);

  return {
    signalSlug: slug,
    signalName: contribution.record.signalName,
    sideLabel: sideLabelOf(contribution.record.side),
    points: shown,
    direction: directionOf(points),
    // ONE ENTRY IS NOT A TRAJECTORY. A single value printed with an arrow
    // through it would read as a change that has not happened.
    line: shown.length < 2 ? null : shown.map((point) => point.valueLabel).join(' to '),
  };
}

/**
 * What this pattern's rows have done, as trajectories and one sentence.
 *
 * ONE SENTENCE, NEVER SEVERAL. Two neutral lines side by side read as an
 * argument being built, and the point of a neutral line is that it is an
 * observation a coach then goes and looks at.
 */
export function buildMovement(
  contributions: readonly ContributingSignal[],
  records: readonly SignalRecord[]
): PatternMovement {
  // One trajectory per signal and side, in the order the contributions
  // arrived, with a repeat of the same signal drawn once.
  const seen = new Set<string>();
  const trajectories: SignalTrajectory[] = [];
  for (const contribution of contributions) {
    const key = `${contribution.record.signalSlug}::${contribution.record.side ?? 'none'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    trajectories.push(buildTrajectory(contribution, records));
  }

  const quieterCount = trajectories.filter((entry) => entry.direction === 'quieter').length;
  const louderCount = trajectories.filter((entry) => entry.direction === 'louder').length;
  const comparable = trajectories.filter((entry) => entry.direction !== 'unknown').length;

  return {
    trajectories,
    quieterCount,
    louderCount,
    lines: [movementLine({ quieterCount, louderCount, comparable })],
  };
}

/**
 * One sentence, chosen by counting. The order of the branches IS the rule,
 * so there is no case two of them could both answer.
 *
 *   nothing to compare        no signal here has a second dated row yet;
 *   nothing moved             every comparable one landed on its own value;
 *   both directions           whichever side is clearly the larger, else mixed;
 *   quieter only              several, or honestly one;
 *   louder only               more active.
 *
 * "SEVERAL" MEANS SEVERAL, which is why one signal going quiet gets its
 * own line rather than being rounded up into the brief's word.
 */
function movementLine(counts: {
  quieterCount: number;
  louderCount: number;
  comparable: number;
}): string {
  const { quieterCount, louderCount, comparable } = counts;
  if (comparable === 0) return MOVEMENT_LINES.tooEarly;
  if (quieterCount === 0 && louderCount === 0) return MOVEMENT_LINES.steady;

  if (quieterCount > 0 && louderCount > 0) {
    if (quieterCount >= 2 && quieterCount > louderCount) return MOVEMENT_LINES.quieter;
    if (louderCount > quieterCount) return MOVEMENT_LINES.louder;
    return MOVEMENT_LINES.mixed;
  }

  if (louderCount > 0) return MOVEMENT_LINES.louder;
  return quieterCount >= 2 ? MOVEMENT_LINES.quieter : MOVEMENT_LINES.oneQuieter;
}
