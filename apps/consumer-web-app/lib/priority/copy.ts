/**
 * Priority Card — Root's words.
 *
 * Two laws hold everywhere in this file.
 *
 * 1. No insight without a query behind it. Every `build*Reason` function
 *    returns `string | null`, and returns null whenever the real data it
 *    would describe is absent or too thin to describe honestly. The card
 *    renders no reason line at all in that case. Nothing here ever
 *    softens a missing fact into a plausible sentence.
 *
 * 2. Observational, not prescriptive. Root notices and offers, she does
 *    not instruct or grade. No streak language, no missed-day counts, no
 *    "you should", and no em dashes in anything a member reads.
 *
 * Where a priority's own text already exists somewhere else in the
 * product, it is passed through verbatim rather than re-worded here: the
 * Reset Plan's agreed action comes from lib/reset-plan/actionLibrary.ts,
 * the driver's label and description come from the driver library's own
 * seeded rows, the finding sentence comes from
 * lib/longitudinal-intelligence/copy.ts, and Today's Focus text comes from
 * the Coaching Brain. A member must never see a second, drifted wording of
 * something she already agreed to or already read.
 */

import type {
  ImplicatedDriverInput,
  IncompleteActionInput,
  ResetPlanCommitmentInput,
  TodaysFocusInput,
} from './types';

/** The small label above every priority, in every state. */
export const PRIORITY_CARD_LABEL = 'Your priority today';

export const PRIORITY_BUTTON_LABELS = {
  done: 'Done',
  help: 'Help me',
  save: 'Save for later',
} as const;

/** Shown once the member marks the priority done, in the Today page's own accomplished voice. */
export const PRIORITY_DONE_TEXT = 'Done today.';

/** Shown on the collapsed card after Save for later, lower down the page. */
export const PRIORITY_SAVED_TEXT = 'Saved for later. It is here whenever you want it.';

/** The header above the expanded Help me content. Root offering, never instructing. */
export const PRIORITY_HELP_HEADING = 'A smaller way in';

// ---------------------------------------------------------------------
// Rule 0 — re-entry.
// ---------------------------------------------------------------------

/**
 * The re-entry opening deliberately has NO reason line and never will.
 * The only honest reason available would be the length of her absence,
 * and naming that is precisely the guilt the Root Presence System exists
 * to avoid. So this priority is offered with nothing attached to it.
 */
export const RE_ENTRY_PRIORITY_TEXT =
  'Start with one quiet check-in, whenever you have a moment today.';

export const RE_ENTRY_HELP_TEXT =
  'You do not have to check in to make today count. Notice how your body feels right now, and leave it there. That is a real place to start again.';

// ---------------------------------------------------------------------
// Rule 1 — an active Reset Plan commitment not completed today.
// ---------------------------------------------------------------------

/**
 * Her own agreed action, verbatim. The Reset Plan is the one place in the
 * product where a member explicitly agreed to a specific sentence, so
 * showing her anything but that exact sentence would break the agreement.
 */
export function buildResetPlanTitle(input: ResetPlanCommitmentInput): string {
  return input.actionText;
}

/**
 * Real counts from member_reset_plan_daily_logs. Null on day one, when
 * there is genuinely nothing yet to observe: a plan that started today
 * with zero logged days has no history to reflect back, and saying so
 * would be filler rather than an observation.
 */
export function buildResetPlanReason(input: ResetPlanCommitmentInput): string | null {
  if (input.daysLogged <= 0) return null;
  const dayWord = input.daysLogged === 1 ? 'day' : 'days';
  return `You have logged this on ${input.daysLogged} ${dayWord} since your plan started.`;
}

/** The plan's own difficult-day version, which is already this product's established smaller step. */
export function buildResetPlanHelp(input: ResetPlanCommitmentInput): string {
  return input.difficultDayText;
}

// ---------------------------------------------------------------------
// Rule 2 — a strongly implicated driver relevant to her stated goal.
// ---------------------------------------------------------------------

/**
 * Observational by construction. The driver library's own description of
 * what a driver watches is already written as a thing to notice rather
 * than a thing to fix, so the priority is simply an invitation to notice
 * it today.
 */
export function buildDriverTitle(input: ImplicatedDriverInput): string {
  return `Keep an eye on ${input.label.toLowerCase()} today. ${input.whatItObserves}.`;
}

/**
 * The correlation engine's own member-facing sentence for the finding that
 * implicated this driver. Null when that sentence is not available, in
 * which case the card shows the priority with no reason: a driver can be
 * implicated by a finding that is not one of her goal-relevant earned
 * findings, and rather than reaching for a vaguer explanation the card
 * simply stays quiet.
 */
export function buildDriverReason(input: ImplicatedDriverInput): string | null {
  return input.findingSentence;
}

export function buildDriverHelp(input: ImplicatedDriverInput): string {
  return `You do not need to change anything. The next time you notice ${input.label.toLowerCase()} today, make a mental note of it. Your next check-in is where it gets recorded.`;
}

// ---------------------------------------------------------------------
// Rule 3 — an incomplete high-value action.
// ---------------------------------------------------------------------

export function buildIncompleteActionTitle(input: IncompleteActionInput): string {
  return `Pick up ${input.name} where you left off.`;
}

/**
 * Only ever the real date she last touched it, from the source system's
 * own timestamp. Null when that source has no honest timestamp, or when
 * she last touched it today (in which case she has not abandoned
 * anything and there is nothing to observe).
 */
export function buildIncompleteActionReason(
  input: IncompleteActionInput,
  todayLocalDate: string
): string | null {
  if (!input.lastTouchedLocalDate) return null;
  if (input.lastTouchedLocalDate >= todayLocalDate) return null;
  return `You started this on ${formatLocalDate(input.lastTouchedLocalDate)} and it is still open.`;
}

export function buildIncompleteActionHelp(input: IncompleteActionInput): string {
  return input.resumeHint;
}

// ---------------------------------------------------------------------
// Rule 4 — Today's Focus.
// ---------------------------------------------------------------------

/** The Coaching Brain's already-selected focus text, unchanged. */
export function buildTodaysFocusTitle(input: TodaysFocusInput): string {
  return input.focusText;
}

/**
 * The Coaching Brain's own reason, passed through only when this member
 * has real history behind it. On a first day the brain still produces a
 * reason string, but it describes a starting posture rather than an
 * observation of her, and showing it as though Root had noticed something
 * would be exactly the fabricated insight the brief rules out.
 */
export function buildTodaysFocusReason(
  input: TodaysFocusInput,
  hasRealHistory: boolean
): string | null {
  if (!hasRealHistory) return null;
  if (!input.reasonText || input.reasonText.trim().length === 0) return null;
  return input.reasonText;
}

export function buildTodaysFocusHelp(input: TodaysFocusInput): string {
  if (input.suggestedAction && input.suggestedAction.trim().length > 0) {
    return input.suggestedAction;
  }
  return 'If today is full, just read the focus once and let it sit. Noticing it is enough for now.';
}

// ---------------------------------------------------------------------

/** "Aug 5" style, from a plain local date string, with no timezone maths (the string is already the member's own local date). */
function formatLocalDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  if (!year || !month || !day) return localDate;
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
