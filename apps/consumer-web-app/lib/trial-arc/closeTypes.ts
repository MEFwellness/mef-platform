/**
 * DAY 7, "YOUR 7-DAY RESET": the vocabulary.
 *
 * THE SAME STRUCTURAL RULE AS DAY 6, borrowed whole from
 * ./recapTypes.ts: a stored close holds a PLAN, never prose. Which branch
 * the completion beat took, which focus Root picked and from which real
 * inputs, which doors were offered and which one led. ./closeCopy.ts turns
 * that into sentences at read time, deterministically, so not one
 * member-facing word is ever written to the database.
 *
 * WHY IT MATTERS HERE FOR THE SAME REASON IT DID THERE. Prompt 6's
 * post-trial continuation screen reads exactly this row, at a moment when
 * her trial has ended and every gate in the app would answer no. A stored
 * plan plus a pure renderer is what lets that screen render her close
 * without asking a single gate a single question. ./closeCopy.ts imports no
 * database client, no membership module and no assessment registry, and
 * tests/trial-arc-close-guard.test.ts fails the build if that stops being
 * true.
 *
 * THE LANGUAGE CEILING IS DAY 6's, UNCHANGED. This is the seventh day of an
 * account's life, still below every threshold in
 * lib/member-interpretation/config.ts. Nothing here calls anything a
 * pattern, a strength or a problem. The focus is an observation and says so.
 *
 * AND ONE CEILING OF ITS OWN: NOTHING ABOUT ACCESS ENDING. Day 8 handling
 * is a later prompt. There is no slug on this file, and no field on any
 * type below, that a countdown, an expiry, a deadline or a "last day" could
 * be stored in. tests/trial-arc-close-guard.test.ts scans every string this
 * build can render for that vocabulary the same way the em dash guard scans
 * for its character.
 *
 * NO CLAIM WITHOUT A ROW. The completion branch is counted from genuinely
 * completed sessions. The focus's signal is Life Signal Check's own chosen
 * signal and its readiness is Readiness Pulse's own final pattern; where
 * either is missing the focus says so rather than filling it in. The
 * arrival callback exists only when a bound member_public_entry_origin with
 * a real pattern does.
 */

import type { PublicEntryPatternKey } from '@mef/shared-types-contracts';
import { SIGNALS, type Signal } from '../life-signal-check/constants';
import type { ReadinessPattern } from '../readiness-pulse/constants';
import { isPublicEntryPatternKey, type TrialArcRecapNextStep } from './recapTypes';

export { isPublicEntryPatternKey };

/**
 * How the week actually went, in the only two shapes this screen has.
 *
 *   full     All three free conversations are genuinely finished. She gave
 *            the week real attention and is told so.
 *   partial  Anything less. The ordinary case, and it is never shame and
 *            never a count of what she did not do: "this week opened the
 *            door, the next one is where it gets specific".
 *
 * The seven day experiment is deliberately NOT part of this test. It is an
 * offer, a decline is a real answer, and a member who declined one has not
 * failed to complete anything.
 */
export const TRIAL_ARC_CLOSE_COMPLETIONS = ['full', 'partial'] as const;
export type TrialArcCloseCompletion = (typeof TRIAL_ARC_CLOSE_COMPLETIONS)[number];

export function isTrialArcCloseCompletion(value: unknown): value is TrialArcCloseCompletion {
  return (
    typeof value === 'string' &&
    (TRIAL_ARC_CLOSE_COMPLETIONS as readonly string[]).includes(value)
  );
}

/**
 * The two shapes the one focus card can take.
 *
 *   signal  Root could name a focus, because Life Signal Check gave her a
 *           loudest signal to name. Readiness Pulse sizes it when it exists.
 *   thin    Root could not pick one honestly, and says exactly that instead
 *           of picking one anyway. There is no third "best guess" kind, and
 *           that absence is the rule.
 */
export const TRIAL_ARC_CLOSE_FOCUS_KINDS = ['signal', 'thin'] as const;
export type TrialArcCloseFocusKind = (typeof TRIAL_ARC_CLOSE_FOCUS_KINDS)[number];

export function isTrialArcCloseFocusKind(value: unknown): value is TrialArcCloseFocusKind {
  return (
    typeof value === 'string' && (TRIAL_ARC_CLOSE_FOCUS_KINDS as readonly string[]).includes(value)
  );
}

/**
 * The doors. Two, and both are invitations.
 *
 *   conversation  "Talk with Osei". The shared discovery call link.
 *   membership    "Continue with Rooted Reset". The shared membership
 *                 pricing link, which may genuinely not be configured, in
 *                 which case this door is not offered at all rather than
 *                 drawn pointing nowhere.
 *
 * READINESS SHAPES EMPHASIS, NEVER AVAILABILITY. Both doors are offered to
 * everybody who can be offered them; which one leads is the only thing her
 * readiness decides. There is no readiness pattern that closes a door.
 */
export const TRIAL_ARC_CLOSE_DOORS = ['conversation', 'membership'] as const;
export type TrialArcCloseDoor = (typeof TRIAL_ARC_CLOSE_DOORS)[number];

export function isTrialArcCloseDoor(value: unknown): value is TrialArcCloseDoor {
  return typeof value === 'string' && (TRIAL_ARC_CLOSE_DOORS as readonly string[]).includes(value);
}

/**
 * What she did with the close, as recorded.
 *
 * 'home' IS A REAL ANSWER AND NOT AN ABSENCE. Tapping no door and going
 * back to Home is a fully respected outcome of this screen, so it is
 * recorded as a decision she made rather than left indistinguishable from
 * having closed the tab. Null on the stored row is that other thing, and
 * Prompt 6 needs to be able to tell them apart.
 */
export const TRIAL_ARC_CLOSE_ACTIONS = ['conversation', 'membership', 'home'] as const;
export type TrialArcCloseAction = (typeof TRIAL_ARC_CLOSE_ACTIONS)[number];

export function isTrialArcCloseAction(value: unknown): value is TrialArcCloseAction {
  return (
    typeof value === 'string' && (TRIAL_ARC_CLOSE_ACTIONS as readonly string[]).includes(value)
  );
}

/** The readiness patterns, as a set, so a stored slug can be validated without importing a list ./constants.ts does not export. */
export const READINESS_PATTERN_KEY_SET: ReadonlySet<string> = new Set([
  'ready_now',
  'ready_if_small',
  'still_deciding',
  'not_yet',
]);

export function isReadinessPattern(value: unknown): value is ReadinessPattern {
  return typeof value === 'string' && READINESS_PATTERN_KEY_SET.has(value);
}

export function isCloseSignal(value: unknown): value is Signal {
  return typeof value === 'string' && (SIGNALS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------
// The plan, as stored.
// ---------------------------------------------------------------------

/**
 * The one focus, and its inputs.
 *
 * SLUGS ONLY. A signal from Life Signal Check's own six, a readiness
 * pattern from Readiness Pulse's own four, and for the thin branch the next
 * unfinished conversation. No free string field on either variant, which is
 * what stops a sentence ever arriving in one.
 */
export type TrialArcCloseFocus =
  | {
      kind: 'signal';
      /** Question 10's pick: the signal her own results screen called hers. */
      signal: Signal;
      /** Readiness Pulse's own final pattern, or null when she never had that conversation. */
      readinessPattern: ReadinessPattern | null;
    }
  | {
      kind: 'thin';
      /** Where the honest "I would want to know what is loudest for you" points. */
      nextStep: TrialArcRecapNextStep;
    };

/**
 * What the week counted, and the window it counted over.
 *
 * A COUNTED CLAIM NAMES ITS WINDOW, exactly as day 6's does, so
 * `checkinDays` travels with `trialDays` and the rendered sentence says
 * both. `conversations` is how many of the three free conversations are
 * genuinely finished, and is what `completion` is derived from.
 */
export type TrialArcCloseCounts = {
  trialDays: number;
  checkinDays: number;
  conversations: number;
};

/** Everything a close row stores. Frozen when it is first composed, and never recomputed. */
export type TrialArcClosePlan = {
  completion: TrialArcCloseCompletion;
  /** Her bound quiz arrival's pattern, or null. The close references it honestly when it exists. */
  arrivalPatternKey: PublicEntryPatternKey | null;
  focus: TrialArcCloseFocus;
  /** The doors genuinely offered, in the order they are shown. Never empty: the conversation door always resolves. */
  doors: TrialArcCloseDoor[];
  /** Which of them leads. Always one of `doors`. */
  leadDoor: TrialArcCloseDoor;
  counts: TrialArcCloseCounts;
};

/** One stored close, as read back from member_trial_arc_closes. */
export type TrialArcCloseRecord = {
  completion: TrialArcCloseCompletion;
  focusKind: TrialArcCloseFocusKind;
  leadDoor: TrialArcCloseDoor;
  plan: TrialArcClosePlan;
  dayNumber: number;
  composedLocalDate: string;
  composedAt: string;
  /** When the close screen genuinely displayed. Null means she was offered it and never opened it. */
  openedAt: string | null;
  /** Which door she took, 'home' for the quiet exit, or null for pressing nothing at all. */
  doorTapped: TrialArcCloseAction | null;
  doorTappedAt: string | null;
};

// ---------------------------------------------------------------------
// The rendered close, built from the plan and never stored.
// ---------------------------------------------------------------------

/** One door, ready to render. `href` is resolved from lib/config/conversionLinks.ts by the caller and handed in. */
export type RenderedCloseDoor = {
  door: TrialArcCloseDoor;
  label: string;
  /** The one line under the button. Never a pitch, never a deadline. */
  body: string;
  href: string;
  /** True for the door this readiness leads with. Exactly one door is ever primary. */
  primary: boolean;
};

export type RenderedTrialArcClose = {
  completion: TrialArcCloseCompletion;
  eyebrow: string;
  heading: string;
  /** The completion beat's one line, branching on her real week. Short on purpose: it is the one line that types itself out, and a typewriter on a paragraph finishes long after she has read it. */
  completionLine: string;
  /** The rest of the beat, rendered plainly beneath it. */
  completionBody: string;
  /** The arrival callback, or null when there is no bound quiz result. */
  arrivalLine: string | null;
  focus: {
    label: string;
    title: string;
    body: string;
    /** What Root would actually do next about it, sized by her readiness. Null on the thin branch, which has a CTA instead. */
    nextStep: string | null;
    /** The thin branch's way back into the unfinished conversation. Null on the signal branch. */
    cta: { label: string; href: string } | null;
  };
  doorsIntro: string;
  doors: RenderedCloseDoor[];
  /** The quiet exit. Always present, always last, never phrased as giving something up. */
  exitLabel: string;
};
