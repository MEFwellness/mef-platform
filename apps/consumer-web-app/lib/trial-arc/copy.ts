/**
 * EVERY WORD THE TRIAL ARC SAYS.
 *
 * ROOT'S VOICE. Curious, warm, short, and honest about what is and is not
 * known. No exclamation marks, no encouragement she has not earned, no
 * congratulation for opening an app.
 *
 * NO COUNTDOWN, ANYWHERE. Not a day number, not "4 days left", not "your
 * trial ends on", not "hurry". A member being paced through a week should
 * be able to read every one of these lines without being told a clock is
 * running. The day number decides WHICH line she gets; it never appears IN
 * one.
 *
 * NO GUILT, ANYWHERE. Silence is "no response logged", never "you missed",
 * never "you have not been back", never a streak, never a count of empty
 * days. The warm re-entry line says what is true (nothing expired, nothing
 * reset) and points at the one thing still waiting.
 *
 * NO EM DASHES. Commas, periods, colons and parentheses.
 *
 * THE ACCURACY RULE. Every branch below is chosen by a real row and states
 * only what that row supports. Nothing here says "you said" about something
 * she did not say, claims progress she has not made, or asserts a cause.
 * The day 5 connection lines put two of her own scored results side by side
 * and say out loud that side by side is all they are.
 */

import { TRIAL_ARC_ROUTES, type TrialArcStep } from './constants';

export interface TrialArcMessageCopy {
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
  /** What the message asks her to finish, recorded on the delivery receipt. */
  step: TrialArcStep;
}

const EYEBROW = 'From Root';

/**
 * Day 1, for a direct signup with no public entry behind her.
 *
 * A member who arrived through Where Your Energy Goes gets the arc framed
 * welcome below instead, because she is owed a sentence about what she
 * already told us before anything is asked of her.
 */
export const TRIAL_ARC_DAY_1: TrialArcMessageCopy = {
  eyebrow: EYEBROW,
  title: 'Where this starts',
  body: 'Most of this app is about how you are doing. The first question is a different one: what are you actually trying to protect. Core Values Snapshot is twelve questions about that, and everything I notice later is read against your answers.',
  ctaLabel: 'Start Core Values Snapshot',
  href: TRIAL_ARC_ROUTES.coreValuesSnapshot,
  step: 'core_values_snapshot',
};

/**
 * The arc's framing on the public entry welcome (migration 197).
 *
 * THE HANDSHAKE IS UNCHANGED IN SUBSTANCE. It still names what she told a
 * website before she had an account, still calls it a first impression from
 * nine questions rather than a measurement, and still refuses to carry it
 * into anything. What the arc adds is the week: it says what the first step
 * is and points at it, so a member who arrived through the funnel and a
 * member who signed up directly are both told the same thing about where to
 * begin.
 *
 * ONLY AN ACCOUNT THE ARC IS GENUINELY LAUNCHED FOR SEES THIS. Everybody
 * else reads ROOT_WELCOME_COPY exactly as it has always been, pointing at
 * the Baseline Assessment.
 */
export const TRIAL_ARC_WELCOME: {
  eyebrow: string;
  title: string;
  ctaLabel: string;
  href: string;
  step: TrialArcStep;
  bodyWithPattern: (patternTitle: string) => string;
  bodyWithoutPattern: string;
} = {
  eyebrow: EYEBROW,
  title: 'I already know where you started',
  ctaLabel: 'Start Core Values Snapshot',
  href: TRIAL_ARC_ROUTES.coreValuesSnapshot,
  step: 'core_values_snapshot',
  bodyWithPattern: (patternTitle: string): string =>
    `Before you had an account, you spent two minutes on Where Your Energy Goes, and what came back was "${patternTitle}". That was a first impression from nine questions, not a measurement, and I have kept it as exactly that. This week is where it stops being a guess. It starts with Core Values Snapshot: twelve questions about what you are actually trying to protect.`,
  bodyWithoutPattern:
    'Before you had an account, you started Where Your Energy Goes but did not finish it, so there is nothing from it worth telling you back. This week starts somewhere better anyway. Core Values Snapshot is twelve questions about what you are actually trying to protect.',
};

/** Day 2, when Core Values Snapshot is genuinely finished. */
export const TRIAL_ARC_DAY_2_ON_PACE: TrialArcMessageCopy = {
  eyebrow: EYEBROW,
  title: 'The other half',
  body: 'You have told me what matters to you. Life Signal Check is the other half of the picture: eleven questions about how your body is actually running right now, in its own words rather than in numbers. The interesting part is what happens when I can read the two together.',
  ctaLabel: 'Start Life Signal Check',
  href: TRIAL_ARC_ROUTES.lifeSignalCheck,
  step: 'life_signal_check',
};

/** The gentle start toward Core Values Snapshot. Used on day 2, and on any later day where it is still genuinely the next thing. */
export const TRIAL_ARC_TOWARD_CVS: TrialArcMessageCopy = {
  eyebrow: EYEBROW,
  title: 'Whenever you are ready',
  body: 'Core Values Snapshot is still the first step, and it will still be there tonight. Twelve questions about what you are trying to protect, about seven minutes, nothing graded and nothing you can answer wrongly.',
  ctaLabel: 'Start Core Values Snapshot',
  href: TRIAL_ARC_ROUTES.coreValuesSnapshot,
  step: 'core_values_snapshot',
};

/** The nudge toward Life Signal Check, for a day whose own step is out of reach until it is done. */
export const TRIAL_ARC_TOWARD_LSC: TrialArcMessageCopy = {
  eyebrow: EYEBROW,
  title: 'One piece missing',
  body: 'I have what matters to you. I do not yet have how your body is actually running, and without that anything I said about the two together would be a guess dressed up as a finding. Life Signal Check is eleven questions.',
  ctaLabel: 'Start Life Signal Check',
  href: TRIAL_ARC_ROUTES.lifeSignalCheck,
  step: 'life_signal_check',
};

/**
 * The fallback pointer for a member who has done everything the week asked
 * for, or declined the one thing left.
 *
 * It exists so the warm re-entry line can never tell somebody who finished
 * Core Values Snapshot on Monday that Core Values Snapshot is still the
 * first step. Her case is the honest place to send her: it is built from
 * her own answers and it is the thing all of this was for.
 */
export const TRIAL_ARC_TOWARD_CASE: TrialArcMessageCopy = {
  eyebrow: EYEBROW,
  title: 'What I have so far',
  body: 'You have given me the two conversations this week is built on. Your case is where I keep what they add up to, and it changes as more of you arrives in it.',
  ctaLabel: 'Open my case',
  href: TRIAL_ARC_ROUTES.caseView,
  step: 'none',
};

/**
 * Days 3 and 4, when an experiment is genuinely available to her.
 *
 * `href` is the experiment page of whichever experience she most recently
 * finished, which is where that experience's own start panel already lives.
 * The arc never starts an experiment and never restates its protocol.
 */
export function trialArcExperimentCopy(href: string): TrialArcMessageCopy {
  return {
    eyebrow: EYEBROW,
    title: 'Small enough to actually run',
    body: 'You have given me enough to have a theory, and a theory is only worth anything once it has been tried. The next step is one small change, held for seven days, with one honest answer at the end about whether it did anything. It is meant to be small.',
    ctaLabel: 'See the experiment',
    href,
    step: 'experiment',
  };
}

/**
 * Day 5, when Body-Value Echo genuinely fired for her.
 *
 * Echo is not something this module decides. It is computed by Life Signal
 * Check's own scoring (lib/life-signal-check/scoring.ts) from her real
 * answers, and it only fires when her loudest signal is genuinely adjacent
 * to her top value AND her Core Values Snapshot branch was not 'aligned'.
 * This line references it; it never manufactures it.
 */
export function trialArcEchoCopy(valueLabel: string, signalLabel: string): TrialArcMessageCopy {
  return {
    eyebrow: EYEBROW,
    title: 'Worth paying attention to',
    body: `You said ${valueLabel} is what matters most right now, and the loudest thing your body reported back was ${signalLabel}. Those two sit closer together than most people expect. I am not telling you one causes the other. I am telling you it is worth paying attention to.`,
    ctaLabel: 'Open my case',
    href: TRIAL_ARC_ROUTES.caseView,
    step: 'none',
  };
}

/**
 * Day 5, when both conversations are finished but Echo did not fire.
 *
 * The honest version of the same beat. It puts her two real results side by
 * side and says explicitly that side by side is all it is, rather than
 * reaching for a connection her own answers did not support. The surprise
 * insight guardrail: nothing manufactured.
 */
export function trialArcSideBySideCopy(valueLabel: string, signalLabel: string): TrialArcMessageCopy {
  return {
    eyebrow: EYEBROW,
    title: 'Two things, side by side',
    body: `${valueLabel} is what you told me matters most right now. ${signalLabel} is what your body reported loudest. I have no theory yet about how those two meet, and I would rather say that than invent one. Both of them are being watched from here.`,
    ctaLabel: 'Open my case',
    href: TRIAL_ARC_ROUTES.caseView,
    step: 'none',
  };
}

/**
 * DAY 6. The recap's own pop-up, and the only trial arc message that opens
 * a screen this build owns rather than an experience that already existed.
 *
 * IT PROMISES ONLY WHAT THE SCREEN CAN KEEP. It does not say what her week
 * showed, because on day 6 that depends entirely on what she actually did,
 * and a pop-up that announced a finding would be writing a cheque the thin
 * data tier cannot cash. It says there is a week to read back and offers to
 * read it back, which is true for every member on every tier.
 *
 * NO COUNTDOWN, per this file's rule. It does not say day six, it does not
 * say one day left, and it does not mention the end of anything.
 */
export const TRIAL_ARC_DAY_6: TrialArcMessageCopy = {
  eyebrow: EYEBROW,
  title: 'What this week showed',
  body: 'I have been keeping track of what you told me this week. Not a score and not a verdict, just the things you actually said, put next to each other in one place. It takes about a minute to read.',
  ctaLabel: 'See what this week showed',
  href: TRIAL_ARC_ROUTES.weekRecap,
  step: 'none',
};

/**
 * DAY 7. The close's own pop-up, and the second trial arc message that
 * opens a screen this build owns.
 *
 * IT PROMISES ONLY WHAT THE SCREEN CAN KEEP. It does not name a focus,
 * because on day 7 that depends entirely on what she actually did, and a
 * pop-up that announced one would be writing a cheque the thin data branch
 * cannot cash. It says the week has an ending worth reading and offers to
 * read it, which is true for every member.
 *
 * IT IS NOT A PAYWALL AND IT DOES NOT WARN. Per this file's rule there is
 * no countdown in it, and per the close's own rule there is nothing about
 * access ending either: no "last day", no "your trial ends", no urgency of
 * any kind. Day 8 handling is a later prompt and this message must not
 * pre-announce it.
 */
export const TRIAL_ARC_DAY_7: TrialArcMessageCopy = {
  eyebrow: EYEBROW,
  title: 'Your 7-Day Reset',
  body: 'Seven days of this, and I have an opinion about where I would look next. Not a verdict and not a plan you have to follow, just the one thing I would work on, and why I would pick it out of everything you told me.',
  ctaLabel: 'Read my 7-Day Reset',
  href: TRIAL_ARC_ROUTES.weekClose,
  step: 'none',
};

/**
 * The one warm re-entry message.
 *
 * SILENCE IS "NO RESPONSE LOGGED". It names no number of days, no streak
 * and no missed anything, and it says the two things that are actually true
 * and actually worth hearing: nothing expired, and nothing has to be caught
 * up on.
 *
 * It points wherever the week's next real step is, which is why it takes
 * the step copy rather than owning a route of its own.
 */
export function trialArcReEntryCopy(next: TrialArcMessageCopy): TrialArcMessageCopy {
  return {
    eyebrow: EYEBROW,
    title: 'Nothing expired',
    body: `No response logged for a little while, and nothing about that is a problem here. Nothing reset, nothing was lost, and there is no backlog waiting for you. ${TRIAL_ARC_STEP_PHRASE[next.step]} is where this picks up, whenever you want it to.`,
    ctaLabel: next.ctaLabel,
    href: next.href,
    step: next.step,
  };
}

/**
 * How each step is named inside a sentence. One name per thing, matching
 * what every other screen calls it, so the re-entry line can never announce
 * something by a name the page it opens does not use.
 */
const TRIAL_ARC_STEP_PHRASE: Record<TrialArcStep, string> = {
  core_values_snapshot: 'Core Values Snapshot',
  life_signal_check: 'Life Signal Check',
  experiment: 'Your seven day experiment',
  none: 'Your case',
};
