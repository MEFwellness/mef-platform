/**
 * WHAT THE ARC MAKES OF HER TODAY, and when it stops talking.
 *
 * DECIDED FRESH, NEVER STORED AS A LABEL. Every function here is pure and
 * takes facts that were read this visit. The pace state is not written
 * anywhere as the truth about a member: the delivery table records which
 * state was in force when a message went out, and nothing ever reads that
 * back to decide behaviour. A member who was stalled on Tuesday and checked
 * in on Wednesday is not stalled on Wednesday, and no row has to be
 * corrected for that to be true.
 *
 * THE FIVE STATES, AND WHY THERE ARE FIVE.
 *
 *   ON_PACE   She completed the step the arc most recently pointed at.
 *   AHEAD     She is further along than the day map expects. The arc goes
 *             quiet on every pacing day except day 5, because somebody who
 *             is running ahead of the week does not need to be told what
 *             the week is.
 *   BEHIND    She has not completed the step the arc most recently pointed
 *             at, and it has not yet been two days.
 *   STALLED   Two or more consecutive days with no check-in and no progress
 *             in any experience.
 *   DECLINED_EXPERIMENT
 *             She has already said no to an experiment, in the only way the
 *             app records one.
 *
 * BEHIND IS NOT A FIFTH BEHAVIOUR, it is the honest absence of the other
 * four, and the build's own day 2 rule requires it to exist: "ON_PACE
 * points at Life Signal Check, otherwise a gentle start message toward Core
 * Values Snapshot". If the fall through were ON_PACE, that "otherwise"
 * branch could never fire and a member who had never opened Core Values
 * Snapshot would be pointed at Life Signal Check on her second morning. It
 * carries no guilt anywhere: it is a state name in a module no member can
 * read, and the copy it selects says nothing about being late.
 *
 * THE PRECEDENCE, HIGHEST FIRST, and each one is a deliberate choice:
 *
 *   1. STALLED. It is the only state about her being ABSENT rather than
 *      about her progress, and the warmest thing to say to somebody who has
 *      been away is not a pacing instruction.
 *   2. DECLINED_EXPERIMENT. A live decline outranks a progress reading
 *      because it is a thing she actually said.
 *   3. AHEAD, then ON_PACE, then BEHIND, which are three readings of one
 *      measurement and are mutually exclusive by construction.
 *
 * THE DECLINE IS ALSO A FACT, NOT ONLY A STATE. `experimentDeclined` stays
 * available on the facts whichever state wins, because the day 3 and day 4
 * rule is "fire only if no experiment is running and none was declined",
 * and that has to hold for a stalled member too. A rule that reads a state
 * name instead of the fact underneath it would re-pitch, to a member who
 * had been away, exactly the thing she had already turned down.
 */

import { TRIAL_ARC_DAY_STEP, isPacingDay, type TrialArcStep } from './constants';

export const TRIAL_ARC_PACE_STATES = [
  'ON_PACE',
  'AHEAD',
  'BEHIND',
  'STALLED',
  'DECLINED_EXPERIMENT',
] as const;

export type TrialArcPaceState = (typeof TRIAL_ARC_PACE_STATES)[number];

export function isTrialArcPaceState(value: unknown): value is TrialArcPaceState {
  return typeof value === 'string' && (TRIAL_ARC_PACE_STATES as readonly string[]).includes(value);
}

/**
 * How far along the week's own sequence she genuinely is, from real rows.
 *
 *   0  nothing finished
 *   1  Core Values Snapshot finished
 *   2  Life Signal Check finished as well
 *   3  an experiment has been started
 *
 * Strictly ordered on purpose, and read from completions rather than from
 * intent: an open draft is not a finish, which is the rule
 * `hasEverCompleted` settled for the whole app on 2026-08-27.
 */
export function arcPosition(facts: {
  cvsCompleted: boolean;
  lscCompleted: boolean;
  experimentStarted: boolean;
}): number {
  if (facts.experimentStarted) return 3;
  if (facts.lscCompleted) return 2;
  if (facts.cvsCompleted) return 1;
  return 0;
}

/**
 * How far the day map expects her to be by the START of a given day.
 *
 * Day 1 expects nothing: Core Values Snapshot is what day 1 is asking for,
 * so a member who has not done it on her first morning is exactly on time.
 * Day 5 expects an experiment because days 3 and 4 were the experiment days.
 */
export function expectedPositionForDay(dayNumber: number): number {
  if (dayNumber <= 1) return 0;
  if (dayNumber === 2) return 1;
  if (dayNumber <= 4) return 2;
  return 3;
}

export interface TrialArcPaceFacts {
  dayNumber: number;
  cvsCompleted: boolean;
  lscCompleted: boolean;
  /** An experiment exists that she started, whatever its status today. */
  experimentStarted: boolean;
  /** An experiment is running right now. Days 3 and 4 stay silent on this alone. */
  experimentActive: boolean;
  /** She has said no to an experiment, in one of the two ways the app records one. See ./engine.ts. */
  experimentDeclined: boolean;
  /**
   * The step the arc most recently pointed at, from the newest delivery on
   * record. Null when she has never been sent a message, in which case the
   * day map's own step for YESTERDAY is used instead: the arc pointed at it
   * in the sense that matters, she simply was not there to read it.
   */
  lastPointedStep: TrialArcStep | null;
  /**
   * Her own calendar days, most recent first, on which she either checked
   * in or made progress in an experience. Bounded to the trial week by the
   * caller.
   */
  activeLocalDates: readonly string[];
  todayLocalDate: string;
}

/** Whether the step the arc last pointed at is genuinely finished. */
export function pointedStepCompleted(facts: TrialArcPaceFacts): boolean {
  const step =
    facts.lastPointedStep ?? TRIAL_ARC_DAY_STEP[Math.max(1, facts.dayNumber - 1)] ?? 'none';
  switch (step) {
    case 'core_values_snapshot':
      return facts.cvsCompleted;
    case 'life_signal_check':
      return facts.lscCompleted;
    case 'experiment':
      return facts.experimentStarted;
    case 'none':
      // Nothing was asked of her, so nothing is outstanding.
      return true;
  }
}

/**
 * Two or more consecutive days, ending yesterday, with nothing at all on
 * them.
 *
 * COUNTED BACKWARDS FROM YESTERDAY, NOT FROM TODAY. Today is still being
 * lived: a member opening the app at nine in the morning has not yet had
 * the chance to check in, and counting today would call almost every
 * morning visitor stalled.
 *
 * A member on day 1 or day 2 can never be stalled, because there have not
 * been two whole days behind her to be quiet on.
 */
export function isStalled(facts: {
  dayNumber: number;
  activeLocalDates: readonly string[];
  todayLocalDate: string;
}): boolean {
  if (facts.dayNumber < 3) return false;
  const active = new Set(facts.activeLocalDates);
  let quiet = 0;
  for (let back = 1; back <= facts.dayNumber - 1; back += 1) {
    const day = shiftLocalDate(facts.todayLocalDate, -back);
    if (active.has(day)) break;
    quiet += 1;
    if (quiet >= 2) return true;
  }
  return false;
}

/** Plain YYYY-MM-DD arithmetic, parsed as UTC midnight, same as lib/feed/dateMath.ts. */
function shiftLocalDate(localDate: string, days: number): string {
  const date = new Date(`${localDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The state, from facts already in hand. Pure, synchronous and total. */
export function decidePaceState(facts: TrialArcPaceFacts): TrialArcPaceState {
  if (isStalled(facts)) return 'STALLED';
  if (facts.experimentDeclined) return 'DECLINED_EXPERIMENT';

  const position = arcPosition(facts);
  if (position > expectedPositionForDay(facts.dayNumber)) return 'AHEAD';
  return pointedStepCompleted(facts) ? 'ON_PACE' : 'BEHIND';
}

// ---------------------------------------------------------------------
// The closer.
// ---------------------------------------------------------------------

/**
 * One row of the delivery table, as the closer reads it.
 */
export interface TrialArcDeliveryFact {
  messageKey: string;
  dayNumber: number;
  pointedStep: TrialArcStep;
  paceState: TrialArcPaceState;
  deliveredLocalDate: string;
  ctaTappedAt: string | null;
}

/** How many ignored pacing messages end the pacing for good. */
export const TRIAL_ARC_IGNORED_LIMIT = 3;

/**
 * Was this message ignored.
 *
 * IGNORED HAS A DEFINITION, and it is deliberately generous to her. It
 * means the message genuinely reached her screen (there is a receipt, and
 * a receipt is only ever written by a mounted effect on a real display),
 * AND she neither pressed its primary button nor completed the step it
 * pointed at on that same day. Doing the thing counts as answering the
 * message even if she went and did it from somewhere else entirely, which
 * is the honest reading: the arc asked for a step, not for a tap.
 *
 * A message that pointed at nothing can only be answered by the tap, since
 * there was no step to complete. There is exactly one of those in days 1
 * to 5, the day 5 connection, and it is an observation rather than a
 * request.
 */
export function wasIgnored(
  delivery: TrialArcDeliveryFact,
  stepCompletedLocalDate: (step: TrialArcStep) => string | null
): boolean {
  if (delivery.ctaTappedAt !== null) return false;
  if (delivery.pointedStep === 'none') return true;
  return stepCompletedLocalDate(delivery.pointedStep) !== delivery.deliveredLocalDate;
}

export interface TrialArcClosure {
  /** How many delivered PACING messages she neither acted on nor answered with the step. */
  ignoredCount: number;
  /** True once that count reaches the limit. Days 1 to 5 stop, permanently. */
  pacingClosed: boolean;
  /** True when the one warm re-entry message has already been sent this week. */
  stalledMessageSent: boolean;
}

/**
 * The closer.
 *
 * IT STOPS PACING, AND ONLY PACING. Day 6's recap and day 7's close are
 * milestones, not pacing, and each is offered exactly once whatever this
 * says. That is why the count below filters on `isPacingDay` rather than
 * counting every receipt: a later prompt adding those two days gets the
 * right behaviour by construction, and cannot silence them by accident.
 *
 * IT COUNTS DELIVERIES, NOT DAYS. Three ignored messages is three real
 * displays she did nothing with, which may have happened on days 1, 2 and
 * 4 with nothing in between. A member who was simply never there to be
 * shown anything has ignored nothing, and the arc is still speaking to her
 * when she comes back.
 */
export function trialArcClosure(
  deliveries: readonly TrialArcDeliveryFact[],
  stepCompletedLocalDate: (step: TrialArcStep) => string | null
): TrialArcClosure {
  const pacing = deliveries.filter((delivery) => isPacingDay(delivery.dayNumber));
  const ignoredCount = pacing.filter((delivery) => wasIgnored(delivery, stepCompletedLocalDate)).length;
  return {
    ignoredCount,
    pacingClosed: ignoredCount >= TRIAL_ARC_IGNORED_LIMIT,
    stalledMessageSent: deliveries.some((delivery) => delivery.paceState === 'STALLED'),
  };
}
