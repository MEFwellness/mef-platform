/**
 * DAY 7, every word "Your 7-Day Reset" says, rendered from the stored plan
 * and from nothing else.
 *
 * THIS FILE READS NOTHING. No Supabase client, no membership module, no
 * assessment registry, no entitlement, no clock, and no environment
 * variable. It is a pure function of a TrialArcClosePlan plus the two door
 * addresses, which the caller resolves from lib/config/conversionLinks.ts
 * and hands in. That is the property Prompt 6 depends on: the post-trial
 * continuation screen renders this same close after her trial has ended,
 * when every gate in the app would answer no, and it does it without asking
 * any of them. tests/trial-arc-close-guard.test.ts fails the build if an
 * import here ever suggests otherwise.
 *
 * WHY THE ADDRESSES ARE PASSED IN AND NOT STORED. A stored URL is a URL
 * that goes stale. The plan holds a door NAME; the address is resolved
 * fresh on every render, so changing the booking link or setting the
 * membership page in Vercel changes a close composed last week too, with no
 * migration and no backfill.
 *
 * ROOT'S VOICE, AT THE OBSERVATION TIER. This is the seventh day of an
 * account's life, still below every threshold in
 * lib/member-interpretation/config.ts. Nothing here calls anything a
 * pattern, a strength or a problem. The focus is what Root would look at
 * next, said as an opinion she is willing to own, never as a finding.
 *
 * IT IS NOT A PAYWALL, AND THE RULE IS ABSOLUTE. Nothing on this screen
 * says or implies that access is ending. No countdown, no number of days
 * remaining, no "last day", no expiry, no deadline, no urgency of any kind.
 * Day 8 handling is a later prompt and this screen must not pre-announce
 * it. tests/trial-arc-close-guard.test.ts scans every string this file can
 * render for that vocabulary, the same way the em dash guard scans for its
 * character.
 *
 * THE DOORS ARE INVITATIONS. Both of them are offered to everybody who can
 * be offered them, both of them can be declined by doing nothing, and the
 * quiet exit is on the screen with the same weight as the rest of it.
 *
 * NO EM DASHES. Commas, periods, colons and parentheses.
 *
 * EVERY LABEL COMES FROM THE MODULE THAT OWNS IT. SIGNAL_LABEL,
 * READINESS_PATTERN_LABEL and ENERGY_PATTERN_COPY. One name per thing, so
 * this screen can never call something by a name the screen she came from
 * does not use.
 */

import { SIGNAL_LABEL, type Signal } from '../life-signal-check/constants';
import { READINESS_PATTERN_LABEL } from '../readiness-pulse/constants';
import type { ReadinessPattern } from '../readiness-pulse/constants';
import { ENERGY_PATTERN_COPY } from '../public-entry/copy';
import { TRIAL_ARC_ROUTES } from './constants';
import type { TrialArcRecapNextStep } from './recapTypes';
import type {
  RenderedCloseDoor,
  RenderedTrialArcClose,
  TrialArcCloseDoor,
  TrialArcCloseFocus,
  TrialArcClosePlan,
} from './closeTypes';

export const TRIAL_ARC_CLOSE_EYEBROW = 'From Root';

/**
 * The screen's name, and it is a name rather than a countdown.
 *
 * "7-Day" is the length of the week she has just had, which is a fact about
 * the past. It is not a number of days remaining, and there is no sentence
 * anywhere below that turns it into one.
 */
export const TRIAL_ARC_CLOSE_HEADING = 'Your 7-Day Reset';

export const TRIAL_ARC_CLOSE_EXIT_LABEL = 'Back to Home';

// ---------------------------------------------------------------------
// The completion beat.
// ---------------------------------------------------------------------

/**
 * Full: all three free conversations genuinely finished.
 *
 * It says what she did without inflating it, and it does not congratulate
 * her for opening an app.
 */
export const TRIAL_ARC_CLOSE_FULL_LINE = 'You finished all three conversations in one week.';

export const TRIAL_ARC_CLOSE_FULL_BODY =
  'Most people do not, and I am not going to pretend that is nothing. You gave this week real attention, and everything below is built out of what you told me in it.';

/**
 * Partial: anything less, which is the ordinary shape of a first week.
 *
 * THE ONE SENTENCE THIS BRANCH MAY NEVER CONTAIN is a count of what she did
 * not do. No "you only did one", no "two of three", no list of what is
 * still open. It is generous because the generous reading is also the true
 * one: a week is a short time and nothing here was owed.
 */
export const TRIAL_ARC_CLOSE_PARTIAL_LINE =
  'This week opened the door. The next one is where it gets specific.';

export const TRIAL_ARC_CLOSE_PARTIAL_BODY =
  'Nothing you started is lost and nothing has to be caught up on. What you did tell me is already enough for me to have an opinion about where I would look next, and that is the whole of this screen.';

// ---------------------------------------------------------------------
// The arrival callback.
// ---------------------------------------------------------------------

/**
 * She came in tired, and the close says so, honestly.
 *
 * TWO BRANCHES, AND THE DIFFERENCE IS WHETHER ANYTHING GENUINELY WENT
 * UNDERNEATH IT. When Root can name a focus from her own answers, the week
 * really did find something under the arrival and it says so. When it
 * cannot, saying "here is what we found underneath" and then showing her a
 * question is the manufactured connection this build refuses, so it states
 * plainly that the quiz is still the only read there is. Same rule, and the
 * same reasoning, as day 6's callback card.
 */
function arrivalLineFor(plan: TrialArcClosePlan): string | null {
  if (!plan.arrivalPatternKey) return null;
  const title = ENERGY_PATTERN_COPY[plan.arrivalPatternKey].title;
  if (plan.focus.kind === 'signal') {
    return `You came in tired. Before you had an account, nine questions about your energy came back as "${title}". That was a first impression from a two minute quiz, not a measurement. Here is what the week found underneath it, in your own answers.`;
  }
  return `You came in tired. Before you had an account, nine questions about your energy came back as "${title}". That was a first impression from a two minute quiz, not a measurement, and it is still the only read I have.`;
}

// ---------------------------------------------------------------------
// The focus.
// ---------------------------------------------------------------------

export const TRIAL_ARC_CLOSE_FOCUS_LABEL = "Here's what I'd work on next";

/**
 * What working on each signal would actually mean.
 *
 * SIX LINES, ONE PER SIGNAL, and each one is about the thing she named
 * rather than about a protocol. The sizing is a separate sentence below,
 * because the WHAT comes from Life Signal Check and the HOW comes from
 * Readiness Pulse, and mixing them into one string would mean twenty four
 * strings that could drift apart.
 */
const FOCUS_BY_SIGNAL: Record<Signal, string> = {
  energy:
    'Of the six signals Life Signal Check asked about, energy is the one you came back to. So that is where I would start, and not by trying to add more of it. I would want to know where it is actually going first.',
  sleep:
    'Of the six signals Life Signal Check asked about, sleep is the one you came back to. So that is where I would start, and the part of sleep you can actually reach is the hour before it, not the sleep itself.',
  tension:
    'Of the six signals Life Signal Check asked about, tension is the one you came back to. So that is where I would start: where you hold it, and what tends to be happening just before it shows up.',
  digestion:
    'Of the six signals Life Signal Check asked about, digestion is the one you came back to. So that is where I would start, and I would look at how meals actually happen on an ordinary day before I looked at what is on the plate.',
  body:
    'Of the six signals Life Signal Check asked about, your body is the one you came back to. So that is where I would start, and I would begin with what makes it easier rather than with what would make it stop.',
  mind:
    'Of the six signals Life Signal Check asked about, your mind is the one you came back to. So that is where I would start, and the first question is whether any part of your day is genuinely yours.',
};

/**
 * How big the next step is, and she is the one who decided that.
 *
 * READY NOW AND READY IF IT IS SMALL GET SIZED VERSIONS OF THE SAME THING.
 * STILL DECIDING AND NOT YET GET AN OBSERVATION, and that is not a softer
 * pitch, it is a different thing entirely: nothing is asked of her, nothing
 * is scheduled, and the only next move on offer is noticing. That is
 * Readiness Pulse's own position on both of those answers
 * (lib/readiness-pulse/copy.ts), kept rather than quietly walked back on
 * the last day of the week.
 *
 * NULL is its own honest branch. A member who never had Readiness Pulse has
 * not told me how much room her life has, and guessing at it would be
 * putting a size on her behalf.
 */
const SIZED_BY_READINESS: Record<ReadinessPattern, string> = {
  ready_now:
    'You told me you are ready now, so I would not shrink this to protect you from it. One real change, held for a week, and one honest answer at the end about whether it did anything.',
  ready_if_small:
    'You told me you are ready if it stays small, so I would keep it small on purpose. Two minutes, not twenty, held for a week. Small and real beats big and abandoned, every time.',
  still_deciding:
    'You told me you are still deciding, and deciding is a stage rather than a stall. So I would not ask you to change anything about this yet. I would ask you to notice it once a day, and then decide from what you actually saw.',
  not_yet:
    'You told me not yet, and I believe you. Nothing about this needs to change for that to stay true. If anything happens next it is noticing, one question a day, with nothing attached to your answer.',
};

const SIZED_WITHOUT_READINESS =
  'What I do not know is how much room your life actually has for this. Readiness Pulse is the conversation that asks, and you have not had it yet, so I would rather size this with you than put a number on it myself.';

/** Where each next step goes, and what its button says. One route per step, from the shared route map. */
const NEXT_STEP: Record<TrialArcRecapNextStep, { label: string; href: string; phrase: string }> = {
  core_values_snapshot: {
    label: 'Start Core Values Snapshot',
    href: TRIAL_ARC_ROUTES.coreValuesSnapshot,
    phrase:
      'Core Values Snapshot comes first, twelve questions about what you are trying to protect, and Life Signal Check is the half that answers this one.',
  },
  life_signal_check: {
    label: 'Start Life Signal Check',
    href: TRIAL_ARC_ROUTES.lifeSignalCheck,
    phrase:
      'Life Signal Check is the conversation that asks, eleven questions about how your body is actually running right now.',
  },
  readiness_pulse: {
    label: 'Start Readiness Pulse',
    href: TRIAL_ARC_ROUTES.readinessPulse,
    phrase: 'Readiness Pulse is the one still open, nine questions about what your life has room for.',
  },
  case: {
    label: 'Open my case',
    href: TRIAL_ARC_ROUTES.caseView,
    phrase: 'Your case is where everything you have told me is kept, and it is the honest place to look.',
  },
};

export const TRIAL_ARC_CLOSE_THIN_TITLE = "What's loudest for you";

function focusFor(focus: TrialArcCloseFocus): RenderedTrialArcClose['focus'] {
  if (focus.kind === 'signal') {
    return {
      label: TRIAL_ARC_CLOSE_FOCUS_LABEL,
      title: SIGNAL_LABEL[focus.signal],
      body: FOCUS_BY_SIGNAL[focus.signal],
      nextStep: focus.readinessPattern
        ? SIZED_BY_READINESS[focus.readinessPattern]
        : SIZED_WITHOUT_READINESS,
      cta: null,
    };
  }

  const step = NEXT_STEP[focus.nextStep];
  return {
    label: TRIAL_ARC_CLOSE_FOCUS_LABEL,
    title: TRIAL_ARC_CLOSE_THIN_TITLE,
    // THE REFUSAL, AND IT IS THE WHOLE POINT OF THIS BRANCH. Root has an
    // opinion about where to look only when there is something to look at.
    // Naming a focus here would be a guess with her name on it, so she says
    // what she would want to know instead and points at the conversation
    // that would tell her.
    body: `Before I would pick a focus, I would want to know what is loudest for you. ${step.phrase} I could name something anyway, and it would be a guess with my name on it, which is worth less to you than an honest blank.`,
    nextStep: null,
    cta: { label: step.label, href: step.href },
  };
}

// ---------------------------------------------------------------------
// The doors.
// ---------------------------------------------------------------------

/**
 * The line above both doors.
 *
 * It says out loud that neither one is required, because that is true and
 * because a member reading a closing screen is entitled to know it before
 * she reads the buttons.
 */
export const TRIAL_ARC_CLOSE_DOORS_INTRO =
  'Two ways this can keep going, and you are not required to take either one today.';

export const TRIAL_ARC_CLOSE_DOOR_LABEL: Record<TrialArcCloseDoor, string> = {
  conversation: 'Talk with Osei',
  membership: 'Continue with Rooted Reset',
};

/**
 * Each door has two bodies: one for when it is leading, one for when it is
 * standing beside the other.
 *
 * READINESS DECIDES WHICH, AND ONLY WHICH. Both doors are on the screen
 * either way. Ready Now and Ready If It Is Small lead with membership,
 * because they have already said they are ready and being asked to book a
 * call to prove it again is a smaller door than the one they asked for.
 * Still Deciding and Not Yet lead with the conversation, because a person
 * who has told me she is not ready should be met by a person and not by a
 * price. Neither version pressures, and neither mentions a clock.
 */
const DOOR_BODY: Record<TrialArcCloseDoor, { primary: string; secondary: string }> = {
  conversation: {
    primary:
      'A real conversation with Osei about what you just read. Nothing is decided on it, there is nothing to prepare, and it is genuinely fine to book one and still say no afterwards.',
    secondary:
      'If you would rather talk it through with a person first, that door is open too, and nothing is decided on that call either.',
  },
  membership: {
    primary:
      'The ongoing version of what this week was: coaching that keeps reading your own answers and adjusts as your life actually changes. Here is what is in it and what it costs.',
    secondary:
      'And if you would rather just look at what ongoing support includes, it is a page, not a pitch.',
  },
};

/**
 * The doors, in the order they are shown: the lead first, the other one
 * after it.
 *
 * A DOOR WITH NO ADDRESS IS NOT DRAWN. The membership page may genuinely
 * not be configured yet (lib/config/conversionLinks.ts returns null for
 * it), and this build's answer to that is nothing rather than a placeholder
 * or a link that does not move. The close still works: the conversation
 * door always resolves, and a screen with one real door on it is a screen
 * with one real door on it.
 */
function doorsFor(
  plan: TrialArcClosePlan,
  links: { discoveryCallUrl: string; membershipPricingUrl: string | null }
): RenderedCloseDoor[] {
  const href = (door: TrialArcCloseDoor): string | null =>
    door === 'conversation' ? links.discoveryCallUrl : links.membershipPricingUrl;

  const ordered: TrialArcCloseDoor[] = [
    ...plan.doors.filter((door) => door === plan.leadDoor),
    ...plan.doors.filter((door) => door !== plan.leadDoor),
  ];

  const drawn = ordered
    .map((door) => ({ door, url: href(door) }))
    .filter((entry): entry is { door: TrialArcCloseDoor; url: string } => entry.url !== null);

  // The lead door itself can be the one with no address, so "primary" is the
  // first door that is genuinely drawn rather than the stored lead. A screen
  // with a secondary tone on its only button reads like an apology.
  return drawn.map((entry, index) => ({
    door: entry.door,
    label: TRIAL_ARC_CLOSE_DOOR_LABEL[entry.door],
    body: index === 0 ? DOOR_BODY[entry.door].primary : DOOR_BODY[entry.door].secondary,
    href: entry.url,
    primary: index === 0,
  }));
}

// ---------------------------------------------------------------------
// The whole close.
// ---------------------------------------------------------------------

/**
 * The close as words. Deterministic: the same plan and the same two
 * addresses always read the same way, today and on the continuation screen
 * next week.
 */
export function renderTrialArcClose(
  plan: TrialArcClosePlan,
  links: { discoveryCallUrl: string; membershipPricingUrl: string | null }
): RenderedTrialArcClose {
  return {
    completion: plan.completion,
    eyebrow: TRIAL_ARC_CLOSE_EYEBROW,
    heading: TRIAL_ARC_CLOSE_HEADING,
    completionLine:
      plan.completion === 'full' ? TRIAL_ARC_CLOSE_FULL_LINE : TRIAL_ARC_CLOSE_PARTIAL_LINE,
    completionBody:
      plan.completion === 'full' ? TRIAL_ARC_CLOSE_FULL_BODY : TRIAL_ARC_CLOSE_PARTIAL_BODY,
    arrivalLine: arrivalLineFor(plan),
    focus: focusFor(plan.focus),
    doorsIntro: TRIAL_ARC_CLOSE_DOORS_INTRO,
    doors: doorsFor(plan, links),
    exitLabel: TRIAL_ARC_CLOSE_EXIT_LABEL,
  };
}

/**
 * Her readiness, as a label, for a verification run and for a test that
 * wants to say which shape it is asserting. Never rendered on the screen
 * on its own: the close reads her readiness back inside a sentence, in
 * Readiness Pulse's own words, rather than printing the label as a verdict.
 */
export function closeReadinessLabel(pattern: ReadinessPattern): string {
  return READINESS_PATTERN_LABEL[pattern];
}
