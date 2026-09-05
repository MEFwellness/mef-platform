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
  // Day 6 is the recap. It states what the week held and asks for nothing
  // to be completed, which is what 'none' means here, and it is a milestone
  // rather than a pacing day, so the closer in ./state.ts can never stop
  // it.
  6: 'none',
  // Day 7 is the close. Like the recap it states something and asks for
  // nothing to be completed, which is what 'none' means here, and it is a
  // milestone rather than a pacing day, so the closer in ./state.ts can
  // never stop it either.
  7: 'none',
};

/**
 * The last day this build has anything to say on.
 *
 * Now 7: the close, "Your 7-Day Reset", is built. It is stated as a number
 * here rather than left implicit in the day map, so a later change to what
 * the week covers is a change to this line and not an accident. It happens
 * to equal TRIAL_ARC_LAST_DAY today, and the two are still separate facts:
 * one is how long the trial week is, the other is how much of it has been
 * written.
 */
export const TRIAL_ARC_LAST_BUILT_DAY = 7;

/**
 * The first day the recap exists on.
 *
 * The same number as TRIAL_ARC_LAST_PACING_DAY + 1 by arithmetic, and
 * deliberately not written that way: this is a statement about which day
 * "What This Week Showed" belongs to, and the day the pacing stops is a
 * different fact that happens to sit beside it. A change to one is not
 * automatically a change to the other.
 */
export const TRIAL_ARC_FIRST_RECAP_DAY = 6;

/**
 * The day the close belongs to.
 *
 * Written as its own statement for the same reason TRIAL_ARC_FIRST_RECAP_DAY
 * is: "Your 7-Day Reset" belongs to the last day of the week, and the fact
 * that the week happens to be seven days long is a different statement that
 * lives in TRIAL_ARC_LAST_DAY. A change to one is not automatically a change
 * to the other.
 */
export const TRIAL_ARC_CLOSE_DAY = 7;

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
 */
export const TRIAL_ARC_ROUTES = {
  coreValuesSnapshot: '/assessments/core-values-snapshot',
  lifeSignalCheck: '/assessments/life-signal-check',
  readinessPulse: '/assessments/readiness-pulse',
  caseView: '/case',
  /**
   * Day 6's recap, "What This Week Showed".
   *
   * THE ARC'S ONE SCREEN OF ITS OWN. Days 1 to 5 are sentences Root says
   * inside a pop-up and they point at experiences that already exist; day 6
   * has something to show her that no other screen shows, so it gets a
   * route. It is member only (lib/auth/staffRouting.ts) and it lives under
   * its own '/trial' prefix rather than beside '/trial-ended', which is a
   * different screen for a different moment and must not be swallowed by
   * the same prefix. Prefix matching respects path boundaries, so it is
   * not.
   */
  weekRecap: '/trial/week',
  /**
   * Day 7's close, "Your 7-Day Reset".
   *
   * The arc's second screen of its own, under the same '/trial' prefix as
   * the recap, which is already in MEMBER_ONLY_PREFIXES
   * (lib/auth/staffRouting.ts) and already covered by the trial lock. It is
   * deliberately NOT under '/trial-ended': that is the post-trial lock
   * screen, a different screen for a different moment, and prefix matching
   * respects path boundaries so the two never touch.
   */
  weekClose: '/trial/close',
} as const;

/**
 * WHERE THE SEVEN DAY EXPERIMENT IS ACTUALLY OFFERED, and it is not the
 * page called /experiment.
 *
 * FOUND BY DRIVING DAY 3 ON THE LIVE SITE (2026-09-04). The arc's day 3 and
 * day 4 message used to point at /assessments/life-signal-check/experiment,
 * which reads like the right place from its name and is not. That page
 * renders the experiment PANEL only once a lifestyle_experiments row
 * already exists; for a member who has never started one it says "No
 * experiment running right now. Your five-minute experiment starts at the
 * end of the Life Signal Check", and offers no way to start one.
 *
 * The arc only ever offers an experiment when none is running, which is
 * exactly the case that page cannot serve, so the button was a dead end
 * every single time it was pressed. Root said "See the experiment" and sent
 * her somewhere that told her there was not one.
 *
 * The offer lives on her own RESULTS screen, where the experience already
 * puts it (LscExperimentPanel / CvsExperimentPanel with her real scoring),
 * which is why these take her completed session's id.
 */
export function trialArcExperimentHref(
  experience: 'life-signal-check' | 'core-values-snapshot',
  sessionId: string
): string {
  return `/assessments/${experience}/results/${sessionId}`;
}
