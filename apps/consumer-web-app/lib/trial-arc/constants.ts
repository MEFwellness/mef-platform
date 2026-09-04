/**
 * The trial arc's vocabulary: what a day is, what a message may point at,
 * and what a message is called.
 *
 * NOTHING HERE DECIDES ANYTHING. The day map below says which step each day
 * of the week is ABOUT; whether a message is sent at all, and which of a
 * day's branches she gets, is decided fresh from real rows in ./engine.ts.
 * Splitting it this way is what lets the whole map be read on one screen
 * and asserted by a test with no database anywhere near it.
 */

/**
 * The seven days of the trial week. Days 1 to 5 are PACING: Root saying
 * what the week's next step is. Days 6 and 7 are MILESTONES: the recap and
 * the close, built in later prompts.
 *
 * The distinction is load bearing rather than descriptive. The closer in
 * ./state.ts stops pacing permanently after three ignored messages, and it
 * must never be able to stop a milestone: a member who ignored every
 * pacing message still gets told, once, what her week actually held and
 * that it is ending. `isPacingDay` is the one place that difference is
 * expressed, so a later prompt adding day 6 and day 7 inherits it without
 * having to remember it.
 */
export const TRIAL_ARC_LAST_PACING_DAY = 5;
export const TRIAL_ARC_LAST_DAY = 7;

export type TrialArcDayKind = 'pacing' | 'milestone';

export function trialArcDayKind(dayNumber: number): TrialArcDayKind | null {
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > TRIAL_ARC_LAST_DAY) return null;
  return dayNumber <= TRIAL_ARC_LAST_PACING_DAY ? 'pacing' : 'milestone';
}

export function isPacingDay(dayNumber: number): boolean {
  return trialArcDayKind(dayNumber) === 'pacing';
}

/**
 * What a trial arc message may point at.
 *
 * These are the three things a member can actually finish inside the trial
 * week, plus 'none' for a message that states an observation and asks for
 * nothing. It is deliberately NOT the assessment registry's key list: the
 * arc points at a step in a week, and Readiness Pulse, the Baseline
 * Assessment and every coach assigned questionnaire are real things she
 * may do that this sequence does not pace.
 */
export const TRIAL_ARC_STEPS = [
  'core_values_snapshot',
  'life_signal_check',
  'experiment',
  'none',
] as const;

export type TrialArcStep = (typeof TRIAL_ARC_STEPS)[number];

export function isTrialArcStep(value: unknown): value is TrialArcStep {
  return typeof value === 'string' && (TRIAL_ARC_STEPS as readonly string[]).includes(value);
}

/**
 * The day map, as a plain statement of what each pacing day is about.
 *
 * Read by ./state.ts to answer "what did the arc most recently point at"
 * for a day with no delivery on record (she did not open the app that day),
 * and by the copy module to keep its branches honest. The actual message
 * for a day still branches on real rows: day 2 only points at Life Signal
 * Check if her Core Values Snapshot is genuinely finished.
 */
export const TRIAL_ARC_DAY_STEP: Record<number, TrialArcStep> = {
  1: 'core_values_snapshot',
  2: 'life_signal_check',
  3: 'experiment',
  4: 'experiment',
  5: 'none',
};

/**
 * The message key. Named `trial_arc_day:N` so it can never collide with the
 * experiment day-3 and day-7 follow-ups already in the pop-up chain
 * (cvs_day3, lsc_day7, rpl_day3, reset_plan_day7): those are about a seven
 * day EXPERIMENT and have nothing to do with the trial week, and a member
 * on day 3 of her trial who is also on day 3 of an experiment is an
 * ordinary case, not an edge one.
 *
 * The day number in the key is what makes "at most one trial arc pop-up per
 * member per day" true through the pop-up chain's existing machinery,
 * exactly as the Priority Card's date-scoped key does: today's key can be
 * dismissed once, and tomorrow is a genuinely different message.
 */
export function trialArcPopupMessageKey(dayNumber: number): string {
  return `trial_arc_day:${dayNumber}`;
}

/** The day number carried by a trial arc message key, or null for anything else. */
export function trialArcDayFromMessageKey(messageKey: string): number | null {
  const match = /^trial_arc_day:([1-9][0-9]*)$/.exec(messageKey);
  if (!match) return null;
  const day = Number(match[1]);
  return trialArcDayKind(day) === null ? null : day;
}

/**
 * Where each step lives. One route per step, so the pop-up's button and any
 * later surface can never send her somewhere different from what the
 * message named.
 *
 * The two experiment routes are the experiences' own experiment pages,
 * which already hold the real "start the seven days" panel
 * (CvsExperimentPanel / LscExperimentPanel). The arc never starts an
 * experiment itself and never duplicates that panel.
 */
export const TRIAL_ARC_ROUTES = {
  coreValuesSnapshot: '/assessments/core-values-snapshot',
  lifeSignalCheck: '/assessments/life-signal-check',
  coreValuesSnapshotExperiment: '/assessments/core-values-snapshot/experiment',
  lifeSignalCheckExperiment: '/assessments/life-signal-check/experiment',
  caseView: '/case',
} as const;
