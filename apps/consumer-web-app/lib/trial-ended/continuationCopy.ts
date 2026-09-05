/**
 * DAY 8 AND AFTER: every word the continuation screen says.
 *
 * THIS FILE READS NOTHING. No Supabase client, no membership module, no
 * assessment registry, no entitlement, no clock, and no environment
 * variable. It is a pure function of a TrialEndedContinuationState plus the
 * two door addresses, which the page resolves from
 * lib/config/conversionLinks.ts and hands in. That is what lets this screen
 * render after her trial has ended, when every gate in the app would answer
 * no. tests/trial-ended-continuation.test.ts walks its whole runtime import
 * graph and fails the build if that stops being true.
 *
 * IT IS NOT A SECOND IMPLEMENTATION OF DAY 7. The outcome card and the two
 * doors are rendered by lib/trial-arc/closeCopy.ts, the same renderer the
 * day 7 screen uses, from the same stored plan. What this file adds is the
 * frame around them: which state she is in, the honest sentence for that
 * state, and the way back into her own week.
 *
 * NOTHING HERE PRESSURES, AND THE RULE IS ABSOLUTE. No countdown, no number
 * of days remaining, no expiry, no deadline, no "before you lose", no
 * urgency of any kind. Saying plainly that her free week is complete is
 * allowed and is the honest thing; turning that into a reason to hurry is
 * not, and there is no branch below that can.
 *
 * OBSERVATION TIER. This is the eighth day of an account's life, below every
 * threshold in lib/member-interpretation/config.ts. Nothing here calls
 * anything a pattern, a strength or a problem.
 *
 * NO EM DASHES. Commas, periods, colons and parentheses.
 */

import {
  TRIAL_ARC_CLOSE_DOORS_INTRO,
  renderCloseDoors,
  renderTrialArcClose,
} from '../trial-arc/closeCopy';
import { TRIAL_ENDED_WEEK_PATH } from './paths';
import type { ConversionLinks } from '../config/conversionLinks';
import type { TrialArcCloseDoor } from '../trial-arc/closeTypes';
import type {
  RenderedTrialEndedContinuation,
  RenderedTrialEndedOutcome,
  TrialEndedContinuationState,
  TrialEndedCounts,
} from './continuationTypes';

export const TRIAL_ENDED_EYEBROW = 'From Root';

/**
 * The screen's one heading, and it is the same in all four states.
 *
 * It states a fact about the past: the free week has finished. It does not
 * say anything is being taken away, does not name a date, and does not ask
 * her to do anything about it. One heading rather than four also means
 * there is exactly one sentence to keep honest.
 */
export const TRIAL_ENDED_HEADING = 'Your free week is complete';

/** The plain reassurance, on every state, said rather than implied. */
export const TRIAL_ENDED_KEEP_LINE =
  'Your account is still here, and so is everything in it. Nothing you noticed, logged or answered has been taken away.';

export const TRIAL_ENDED_SUPPORT_LEAD = 'Questions about any of this?';
export const TRIAL_ENDED_SUPPORT_EMAIL = 'support@mefwellness.com';

/** One tap back into her own stored week. */
export const TRIAL_ENDED_WEEK_LINK_LABEL = 'Read your week back';

/**
 * The line above the doors on the states with no stored close to read one
 * off. Word for word the one day 7 uses, taken from it rather than restated
 * so the two screens cannot come to say it differently.
 */
export const TRIAL_ENDED_DOORS_INTRO = TRIAL_ARC_CLOSE_DOORS_INTRO;

/**
 * Which door leads when nothing has told us she is ready.
 *
 * THE CONVERSATION, ALWAYS. Day 7 lets Readiness Pulse decide the emphasis,
 * because on day 7 she may have answered it. Here, on a state with no
 * stored close, nothing about her readiness is known, and leading with a
 * price for somebody who has told us nothing is exactly the pressure this
 * screen refuses. Both doors are still on the screen for everybody who can
 * be offered them.
 */
const DEFAULT_DOORS: readonly TrialArcCloseDoor[] = ['conversation', 'membership'];
const DEFAULT_LEAD_DOOR: TrialArcCloseDoor = 'conversation';

// ---------------------------------------------------------------------
// The opening, per state.
// ---------------------------------------------------------------------

/**
 * The shape every state's opening keeps: this week is yours to keep, here
 * is where I would start, here are the two ways forward. The third beat is
 * the doors and the second is the outcome card, so what varies here is only
 * the first, plus one honest sentence about what she actually has.
 */
const INTRO: Record<TrialEndedContinuationState['kind'], string[]> = {
  full: [
    'The week is finished and what it produced is still yours. Below is what I said at the end of it, unchanged, because it was true then and nothing about it has moved.',
  ],
  close_unopened: [
    'The week is finished and what it produced is still yours.',
    'I put this together at the end of it and you have not seen it yet, so it is here now rather than gone.',
  ],
  recap_only: [
    'The week is finished and what it produced is still yours.',
    'There is no closing note from me to show you, so what is here is the week itself, in your own answers.',
  ],
  no_arc: [
    'Thank you for the time you spent here. Everything you noticed, logged and worked on is exactly where you left it.',
    'There is no summary of the week from me to show you, and I would rather say that than make one up.',
  ],
};

// ---------------------------------------------------------------------
// The one counted line the no-arc state may carry.
// ---------------------------------------------------------------------

/**
 * A COUNTED CLAIM NAMES ITS WINDOW, and this one names two.
 *
 * Nothing is said when there is nothing true to say: an account with no
 * check-ins and no finished conversations gets no line at all, rather than
 * a zero dressed up as an observation. And no clause is drawn for a number
 * that is zero, so "you checked in on 0 days" can never be rendered.
 */
export function trialEndedCountLine(counts: TrialEndedCounts): string | null {
  const clauses: string[] = [];

  if (counts.checkinDays > 0) {
    const day = counts.checkinDays === 1 ? 'day' : 'days';
    clauses.push(
      counts.trialLengthDays && counts.trialLengthDays > 0
        ? `You logged a Daily Reset on ${counts.checkinDays} of your ${counts.trialLengthDays} free ${counts.trialLengthDays === 1 ? 'day' : 'days'}`
        : `You logged a Daily Reset on ${counts.checkinDays} ${day} of your free time here`
    );
  }

  if (counts.conversations > 0) {
    const clause = `finished ${counts.conversations} of the three free conversations`;
    clauses.push(clauses.length > 0 ? `and ${clause}` : `You ${clause}`);
  }

  if (clauses.length === 0) return null;
  return `${clauses.join(', ')}. That is all still on your account.`;
}

// ---------------------------------------------------------------------
// The whole screen.
// ---------------------------------------------------------------------

/**
 * The continuation screen as words. Deterministic: the same state and the
 * same two addresses always read the same way, today and next month.
 */
export function renderTrialEndedContinuation(
  state: TrialEndedContinuationState,
  links: ConversionLinks
): RenderedTrialEndedContinuation {
  const base = {
    eyebrow: TRIAL_ENDED_EYEBROW,
    heading: TRIAL_ENDED_HEADING,
    intro: INTRO[state.kind],
    keepLine: TRIAL_ENDED_KEEP_LINE,
    supportLead: TRIAL_ENDED_SUPPORT_LEAD,
    supportEmail: TRIAL_ENDED_SUPPORT_EMAIL,
  };

  if (state.kind === 'full' || state.kind === 'close_unopened') {
    // Day 7's own renderer, on day 7's own stored plan. The outcome she
    // reads here is the outcome she read then, to the word.
    const close = renderTrialArcClose(state.close, links);
    const outcome: RenderedTrialEndedOutcome = {
      label: close.focus.label,
      title: close.focus.title,
      body: close.focus.body,
      nextStep: close.focus.nextStep,
    };
    return {
      ...base,
      kind: state.kind,
      countLine: null,
      arrivalLine: close.arrivalLine,
      outcome,
      weekLink: state.hasRecap
        ? { label: TRIAL_ENDED_WEEK_LINK_LABEL, href: TRIAL_ENDED_WEEK_PATH }
        : null,
      // Her own stored plan decides which door leads, exactly as it did on
      // day 7, so the emphasis she was shown then is the emphasis now.
      doorsIntro: close.doorsIntro,
      doors: close.doors,
    };
  }

  return {
    ...base,
    kind: state.kind,
    countLine: state.kind === 'no_arc' ? trialEndedCountLine(state.counts) : null,
    arrivalLine: null,
    outcome: null,
    weekLink:
      state.kind === 'recap_only'
        ? { label: TRIAL_ENDED_WEEK_LINK_LABEL, href: TRIAL_ENDED_WEEK_PATH }
        : null,
    doorsIntro: TRIAL_ENDED_DOORS_INTRO,
    doors: renderCloseDoors(DEFAULT_DOORS, DEFAULT_LEAD_DOOR, links),
  };
}

/** Every string this render can put on a screen, for a guard that scans them. */
export function trialEndedContinuationWords(
  rendered: RenderedTrialEndedContinuation
): string[] {
  return [
    rendered.eyebrow,
    rendered.heading,
    ...rendered.intro,
    rendered.countLine ?? '',
    rendered.arrivalLine ?? '',
    rendered.outcome?.label ?? '',
    rendered.outcome?.title ?? '',
    rendered.outcome?.body ?? '',
    rendered.outcome?.nextStep ?? '',
    rendered.weekLink?.label ?? '',
    rendered.keepLine,
    rendered.doorsIntro,
    ...rendered.doors.flatMap((door) => [door.label, door.body]),
    rendered.supportLead,
    rendered.supportEmail,
  ].filter((value) => value.length > 0);
}
