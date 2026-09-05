/**
 * DAY 8 AND AFTER: the vocabulary of the soft continuation state.
 *
 * WHAT THIS SCREEN IS. /trial-ended used to be a lock screen: one heading,
 * two paragraphs and a button, identical for everybody. It is now the day 8
 * state of the trial arc for a prospect whose free week is complete. It
 * preserves what she generated, it offers the two doors, and it pressures
 * nobody.
 *
 * FOUR STATES, AND THEY ARE DECIDED BY WHICH ROWS EXIST. Nothing is
 * recomputed, nothing is re-scored, and no gate is asked anything: the day 6
 * recap and the day 7 close were each composed exactly once, during her
 * week, and this screen reads them back.
 *
 *   full             She has a stored close AND she opened it. Her week's
 *                    outcome is on the screen, exactly as she read it.
 *   close_unopened   She has a stored close and never opened it. The same
 *                    outcome, and one honest sentence saying she is seeing
 *                    it now for the first time. Losing it because she was
 *                    busy on day 7 would be the opposite of "she never
 *                    loses what she generated".
 *   recap_only       A stored recap and no close at all. Her week, and the
 *                    doors, and a line that is honest about the fact that
 *                    there is no closing note.
 *   no_arc           Nothing stored. The state every account locked before
 *                    the arc existed is in, and the one this screen was
 *                    designed FIRST, the same thin-data-first discipline day
 *                    6 was built with. Warm, plain, both doors, and at most
 *                    one counted line that is genuinely true.
 *
 * NO STATE INVENTS A WEEK. There is no branch anywhere below that composes
 * a summary out of nothing, and the no_arc state carries counts rather than
 * a narrative precisely so it cannot start.
 *
 * NOTHING HERE PRESSURES. No countdown, no days remaining, no expiry, no
 * deadline, no "before you lose". The screen may state plainly that the
 * free week is complete; it may never weaponise it.
 * tests/trial-ended-continuation.test.ts scans every string every state can
 * render, the same way day 7's own guard does.
 */

import type { TrialArcClosePlan } from '../trial-arc/closeTypes';
import type { RenderedCloseDoor } from '../trial-arc/closeTypes';

export const TRIAL_ENDED_STATES = ['full', 'close_unopened', 'recap_only', 'no_arc'] as const;

export type TrialEndedStateKind = (typeof TRIAL_ENDED_STATES)[number];

/**
 * What the no-arc state is allowed to count, and the window it counted over.
 *
 * A COUNTED CLAIM NAMES ITS WINDOW, so `checkinDays` never travels without
 * `trialLengthDays`. Both come from rows that already exist: her check-in
 * days through the arc's own existing helper, her free week's length from
 * her own stored subscription window, and her finished conversations from
 * her own completed sessions. Nothing is scored, nothing is interpreted,
 * and there is no field here a sentence could arrive in.
 */
export interface TrialEndedCounts {
  /** Days inside her own free week on which she logged a Daily Reset. */
  checkinDays: number;
  /** How many of the three free conversations are genuinely finished, 0 to 3. */
  conversations: number;
  /** How long her own free week actually was. Null when the window could not be read, in which case the line names no number. */
  trialLengthDays: number | null;
}

/**
 * The state, as facts rather than as a rendered screen.
 *
 * The close plan travels whole, because the outcome card is rendered by day
 * 7's own renderer rather than by a second one. The recap does NOT: this
 * screen only needs to know whether one exists, because the recap is read
 * on its own route.
 */
export type TrialEndedContinuationState =
  | { kind: 'full'; close: TrialArcClosePlan; hasRecap: boolean }
  | { kind: 'close_unopened'; close: TrialArcClosePlan; hasRecap: boolean }
  | { kind: 'recap_only' }
  | { kind: 'no_arc'; counts: TrialEndedCounts };

// ---------------------------------------------------------------------
// The rendered screen, built from the state and never stored.
// ---------------------------------------------------------------------

/** Her preserved Week 1 outcome, on the two states that have one. */
export interface RenderedTrialEndedOutcome {
  label: string;
  title: string;
  body: string;
  /**
   * What Root would actually do about it, sized by her own readiness. Null
   * on the close's thin branch, which has no focus to size.
   *
   * THERE IS NO BUTTON HERE, AND THAT IS DELIBERATE. Day 7's thin branch
   * offers a way into the unfinished conversation, and on day 8 that screen
   * is behind the lock, so the button would send her somewhere that would
   * send her straight back. The card's own words stand without it.
   */
  nextStep: string | null;
}

export interface RenderedTrialEndedContinuation {
  kind: TrialEndedStateKind;
  eyebrow: string;
  heading: string;
  /** The opening, in this state's own voice. One to three short paragraphs. */
  intro: string[];
  /** The one line naming a real number, or null when there is no true number to name. */
  countLine: string | null;
  /** Her week's own callback to the quiz she arrived on, when her stored close carries one. */
  arrivalLine: string | null;
  outcome: RenderedTrialEndedOutcome | null;
  /** One tap to her own stored recap, or null when there is not one to read. */
  weekLink: { label: string; href: string } | null;
  /** The plain reassurance, stated rather than implied. */
  keepLine: string;
  doorsIntro: string;
  doors: RenderedCloseDoor[];
  supportLead: string;
  supportEmail: string;
}
