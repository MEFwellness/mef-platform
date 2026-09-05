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
  BehavioralFrictionInput,
  DailyResetFallbackInput,
  ImplicatedDriverInput,
  IncompleteActionInput,
  QualifiedPatternInput,
  ResetPlanCommitmentInput,
  TodaysFocusInput,
} from './types';

/** The small label above every priority, in every state. */
export const PRIORITY_CARD_LABEL = 'Your priority today';

/**
 * The labels, and which of them a given priority is even allowed to show.
 *
 * `done` and `save` belong to a SELF-REPORTED priority, the kind that
 * happens in her life. `notToday` is an OFFER's decline, and `acknowledge`
 * is the safety override's one way out. lib/priority/actions.ts decides
 * which set a priority gets, from the priority's own stored row, and it is
 * the only thing that may make that decision.
 */
export const PRIORITY_BUTTON_LABELS = {
  done: 'Done',
  help: 'Help me',
  save: 'Save for later',
  notToday: 'Not today',
  acknowledge: 'Okay',
} as const;

/**
 * The primary action on an offer whose destination has no name to carry.
 * The app's own existing words for this: the inline card's link has always
 * said exactly this.
 */
export const PRIORITY_OPEN_FALLBACK_LABEL = 'Open it';

/** Shown once the member marks the priority done, in the Today page's own accomplished voice. */
export const PRIORITY_DONE_TEXT = 'Done today.';

/** Shown on the collapsed card after Save for later, lower down the page. */
export const PRIORITY_SAVED_TEXT = 'Saved for later. It is here whenever you want it.';

/**
 * Shown after "Not today" on an offer. Deliberately not the "Saved for
 * later" sentence: she declined something rather than filing it, and the
 * second half is still true, so the offer stays open without pretending
 * she asked for it back.
 */
export const PRIORITY_NOT_TODAY_TEXT = 'Not today. It is here whenever you want it.';

/**
 * Shown after the safety override's one button. It claims nothing, asks
 * nothing and counts nothing, which is the whole posture of that state.
 */
export const PRIORITY_ACKNOWLEDGED_TEXT = 'Nothing more is needed today.';

/** The header above the expanded Help me content. Root offering, never instructing. */
export const PRIORITY_HELP_HEADING = 'A smaller way in';

/**
 * The adaptation moment's two lines, shown only when she completed
 * yesterday's priority and today's is a different one (see
 * lib/priority/transition.ts for the conditions).
 *
 * Both stay observational. The label names the day and nothing else, and
 * the bridge line says what Root is doing rather than praising her for
 * what she did — no "well done", no streak, no count. The ellipsis is
 * deliberate and the only punctuation here; there are no em dashes in
 * anything a member reads.
 */
export const PRIORITY_BRIDGE_YESTERDAY_LABEL = 'Yesterday';

export const PRIORITY_BRIDGE_TEXT = 'Building on yesterday...';

// ---------------------------------------------------------------------
// The safety override — an unresolved concern raised in a check-in.
// ---------------------------------------------------------------------

/**
 * The strongest state the card has, and the quietest.
 *
 * It deliberately says NOTHING about what she raised. Restating a concern
 * back to someone in a card on a home screen is not care, it is exposure,
 * and it would also mean her words had to travel through this feature to
 * get here. They do not: the only thing this rule receives is a row id.
 *
 * There is no reason line and there never will be, for the same reason
 * re-entry has none: the only available fact is the thing the card must
 * not name.
 *
 * The help text is the one place in this whole feature that gives a
 * direct instruction rather than an offer, and that is correct. Root is
 * not equipped for a medical emergency and says so plainly rather than
 * softening it into a suggestion.
 */
export const SAFETY_PRIORITY_TEXT =
  'Nothing is being asked of you today. Take it gently.';

export const SAFETY_HELP_TEXT =
  'What you raised has been passed to your care team and someone will look at it. If it gets worse, or you feel unsafe at any point, contact a medical professional or your local emergency number. Root is not able to help with that.';

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
// Rule 4's second half — a tier 3 qualified pattern.
// ---------------------------------------------------------------------

/**
 * The correlation engine's own member-facing sentence, unchanged, offered
 * as something to notice.
 *
 * Tier 3 wording only ever reaches here, which is what makes the plain
 * framing honest: the three-tier language module already decided this
 * pattern had earned confident phrasing, and this rule does not get to
 * upgrade or downgrade that judgement. A tier 1 or tier 2 signal never
 * becomes a priority at all.
 */
export function buildQualifiedPatternTitle(input: QualifiedPatternInput): string {
  return `Keep an eye on ${input.label.toLowerCase()} today.`;
}

/** The finding's own sentence. Never re-worded, never summarized. */
export function buildQualifiedPatternReason(input: QualifiedPatternInput): string | null {
  const sentence = input.memberSentence.trim();
  return sentence.length > 0 ? sentence : null;
}

export function buildQualifiedPatternHelp(): string {
  return 'Nothing needs to change because of this. If you notice it today, that is the whole thing. Your next check-in is where it gets recorded.';
}

// ---------------------------------------------------------------------
// Rule 5 — behavioral friction.
// ---------------------------------------------------------------------

/**
 * Root offering an easier version of the thing she is getting stuck on.
 *
 * The hard part of this rule's voice is that its evidence is, by nature,
 * a record of things she did not finish. So none of the three reasons
 * below carries a count. "Started five times and finished once" is a
 * scoreboard, and a scoreboard is the thing this product's copy rules
 * exist to keep off the screen. Each reason states the shape of what was
 * observed and nothing more, which is still fully query-backed: the engine
 * only reaches this rule when the underlying counts crossed the friction
 * service's own thresholds.
 */
export function buildFrictionTitle(input: BehavioralFrictionInput): string {
  switch (input.kind) {
    case 'daily_reset_incomplete':
      return 'Open your Daily Reset and answer just the first question.';
    case 'food_logging_lapsed':
      return 'If you eat something today, log only that one thing.';
    case 'chronic_save_for_later':
      return 'One small thing, and nothing else today: take three slow breaths before your next task.';
  }
}

export function buildFrictionReason(input: BehavioralFrictionInput): string | null {
  switch (input.kind) {
    case 'daily_reset_incomplete':
      return 'Your Daily Reset has been opened more often than it has been finished lately, so today it is a smaller ask.';
    case 'food_logging_lapsed':
      return 'Food logging has been quieter recently than it was before.';
    case 'chronic_save_for_later':
      return 'The last few priorities were set aside, so today Root is offering something smaller.';
  }
}

export function buildFrictionHelp(input: BehavioralFrictionInput): string {
  switch (input.kind) {
    case 'daily_reset_incomplete':
      return 'One answer is enough. You can close it straight after and the answer is still saved.';
    case 'food_logging_lapsed':
      return 'One item, not the whole day. A single entry is a real entry.';
    case 'chronic_save_for_later':
      return 'That is the whole thing. Nothing to open and nothing to log.';
  }
}

export function frictionHref(input: BehavioralFrictionInput): string | null {
  switch (input.kind) {
    case 'daily_reset_incomplete':
      return '/checkin';
    case 'food_logging_lapsed':
      return '/food-lens';
    case 'chronic_save_for_later':
      return null;
  }
}

// ---------------------------------------------------------------------
// The names of the places a priority can point at.
//
// Each one is the name that screen already carries everywhere else a
// member reads it, so the button that opens it and the screen it lands on
// agree. Never a second, friendlier wording invented here.
// ---------------------------------------------------------------------

/** The Daily Reset, which is what /checkin is called on every member surface. */
export const DAILY_RESET_OPEN_TARGET = 'your Daily Reset';

/** Food Lens, exactly as its own screen and its back link name it. */
export const FOOD_LENS_OPEN_TARGET = 'Food Lens';

/** The destination's own name for a friction priority, or null when that kind opens nothing. */
export function frictionOpenTarget(input: BehavioralFrictionInput): string | null {
  switch (input.kind) {
    case 'daily_reset_incomplete':
      return DAILY_RESET_OPEN_TARGET;
    case 'food_logging_lapsed':
      return FOOD_LENS_OPEN_TARGET;
    case 'chronic_save_for_later':
      return null;
  }
}

// ---------------------------------------------------------------------
// Root Movement — the two ways a session can be offered.
// ---------------------------------------------------------------------

/**
 * THE COPY RULES FOR MOVEMENT, stated once because they are stricter than
 * anywhere else in this file and the temptation to break them is stronger.
 *
 *   1. Observational, and only at the tier the evidence allows. The driver
 *      version says what Root is watching, in the driver library's own
 *      words, and nothing beyond it. The fallback version makes no
 *      observation at all, because in that state there is none to make:
 *      every rule with something to say came up empty.
 *   2. NEVER a diagnosis. Root does not say a body is tight, weak, stiff,
 *      imbalanced or out of alignment. It has not examined anyone.
 *   3. NEVER a promise. No session "will help", "will loosen", "will fix"
 *      or "should sort out" anything. The session is offered, and what it
 *      does is hers to find out.
 *   4. NEVER a scold. No "you have not moved", no sitting count, no streak,
 *      no "time to get moving". The evidence behind this rule is largely a
 *      record of stillness, and a scoreboard made of that is the single
 *      worst thing this card could put on a screen.
 *   5. No em dashes, in common with everything else a member reads here.
 *
 * The session's NAME is the template's own, passed through verbatim from
 * movement_session_templates, so the card can never call a session
 * something the Root Movement screens do not.
 */

/**
 * A mapped driver, offered with its session.
 *
 * Deliberately the same opening as `buildDriverTitle` above, because it is
 * the same rung, the same evidence and the same observation. The only
 * difference is that this driver has a session behind it, so Root names it
 * and stops. "if you want it" is doing real work: it is the difference
 * between an offer and an instruction.
 */
export function buildMovementDriverTitle(
  input: ImplicatedDriverInput,
  sessionName: string
): string {
  return `Keep an eye on ${input.label.toLowerCase()} today. ${sessionName} is there if you want it.`;
}

/**
 * "Help me" on a movement priority: the honest smaller version.
 *
 * The smaller version of a session is not a shorter session, and pretending
 * otherwise would be inventing a lineup this product does not have. The
 * honest smaller version is permission to not do it, which is what this
 * says.
 */
export function buildMovementDriverHelp(sessionName: string): string {
  return `Nothing has to happen today. ${sessionName} stays where it is, and it is there when you are ready. You can stop it at any point once you start.`;
}

/**
 * The enriched fallback: her Daily Reset is done and nothing above had
 * anything to say.
 *
 * Makes no claim about her whatsoever, exactly like the goal fallback it
 * sits above. It states what is available and leaves it there.
 */
export function buildMovementFallbackTitle(sessionName: string): string {
  return `${sessionName} is there if you want it today.`;
}

/**
 * The only fact available, and it is a fact about the day rather than about
 * her: she has already done the one thing Root asks for. Never a count,
 * never a streak.
 */
export function buildMovementFallbackReason(): string {
  return 'Your Daily Reset is already done for today.';
}

export function buildMovementFallbackHelp(sessionName: string): string {
  return `Nothing is waiting on you. ${sessionName} is there when you want it, and you can stop at any point.`;
}

// ---------------------------------------------------------------------
// The two adapted framings.
// ---------------------------------------------------------------------

/**
 * What the card says once Root has changed its approach.
 *
 * Neither of these names a day count, a streak, or anything she did or did
 * not do. That is not squeamishness, it is the only honest reading of the
 * evidence: "she ignored this three times" is a fact about Root's
 * suggestion failing, not a fact about her. So the reframe puts the
 * failure where it belongs and offers her a way out of the thread
 * entirely.
 *
 * Approach 1 needs no copy of its own at all. Every rule already authors a
 * smaller step for "Help me", and promoting that to be the priority is a
 * genuinely smaller ask made entirely of words the rule already wrote.
 */
export const APPROACH_SMALLER_HELP_TEXT =
  'If today is full, reading this once is enough. Nothing else is needed.';

export const APPROACH_REFRAMED_HELP_TEXT =
  'This one has not landed, and that is useful to know. If it is not the right thing right now, leave it and Root will bring something else.';

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
// The final fallback. Reached only when rules 0 through 4 all came up
// empty, which is the ordinary state of a brand-new member.
// ---------------------------------------------------------------------

/**
 * She has not done today's Daily Reset. That is the product's real core
 * loop and the one thing that makes everything downstream possible, so it
 * is an honest priority rather than a placeholder invented to fill the
 * card.
 */
export function buildDailyResetTitle(): string {
  return 'Take a few minutes for your Daily Reset.';
}

/**
 * A count, not a claim. Null on day zero, when she has no history at all
 * and the only truthful thing to say about her data is nothing.
 *
 * Deliberately never says how many days she has missed, never mentions a
 * streak, and never suggests the number should be higher.
 */
export function buildDailyResetReason(input: DailyResetFallbackInput): string | null {
  if (input.totalCheckins <= 0) return null;
  const dayWord = input.totalCheckins === 1 ? 'day' : 'days';
  return `You have ${input.totalCheckins} ${dayWord} logged so far. Each one gives Root more to work with.`;
}

export function buildDailyResetHelp(): string {
  return 'It is a short set of questions and you can stop at any point. Even the first few answers are enough for today.';
}

/**
 * She has already done today's Daily Reset, so there is nothing left to
 * ask of her. The priority becomes her own stated reason for being here,
 * quoted back.
 *
 * When she never selected a goal there is nothing real to quote, so the
 * copy stays entirely general and makes no claim about her at all. That is
 * the honest floor of this whole system: a sentence that is true of
 * anyone, offered as an invitation, rather than a fabricated observation
 * about someone Root does not know yet.
 */
export function buildGentleFocusTitle(input: DailyResetFallbackInput): string {
  if (!input.statedGoalLabel) {
    return 'Nothing is waiting on you today. Notice one moment where your body felt good.';
  }
  return `Today, keep one eye on what brought you here: ${input.statedGoalLabel.toLowerCase()}.`;
}

/**
 * Her own onboarding selection, named as hers. This is a quote, not an
 * interpretation, which is why it is allowed to exist for a member with no
 * behavioural history whatsoever. Null when she never chose a goal.
 */
export function buildGentleFocusReason(input: DailyResetFallbackInput): string | null {
  if (!input.statedGoalLabel) return null;
  return 'You chose that when you joined.';
}

export function buildGentleFocusHelp(input: DailyResetFallbackInput): string {
  if (!input.statedGoalLabel) {
    return 'There is nothing to do here. If you want one small thing, take three slow breaths before your next task.';
  }
  return 'Nothing to change today. If a moment connected to it comes up, just notice it and carry on.';
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
