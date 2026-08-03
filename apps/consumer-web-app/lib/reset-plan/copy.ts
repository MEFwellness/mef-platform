/**
 * Personal Reset Plan — all interpretive copy. Every claim here branches on
 * real snapshot/log state; nothing is invented when data is missing (the
 * established null-context pattern from Life Signal Check's own Body-Value
 * Echo/adjacency.ts). Pure functions only, no I/O, so this module is
 * directly unit-testable (see tests/reset-plan-copy.test.ts), same
 * discipline as lib/core-values-snapshot/copy.ts.
 */

import type { CoachingTonePreference } from '@mef/shared-types-contracts';
import { AREA_LABEL } from '../core-values-snapshot/constants';
import { SIGNAL_LABEL, type Signal } from '../life-signal-check/constants';
import { isAdjacent } from '../life-signal-check/adjacency';
import { READINESS_PATTERN_LABEL } from '../readiness-pulse/constants';
import type { ActionTier, ResetPlanDailyState, ResetPlanDay3Response } from './constants';
import { RESET_PLAN_PHILOSOPHY_LINE, resetPlanAction, type ResetPlanAction } from './actionLibrary';
import type { ResetPlanDailyLog, ResetPlanSnapshot } from './types';

export const RESET_PLAN_INTRO_COPY = {
  title: 'You know what matters. You know what is loudest.',
  lines: ["Now we choose where to begin, together. This is my first act as your coach, not another questionnaire."],
  button: 'Begin',
};

/**
 * Screen 2's proposal — her Readiness Pulse targetSignal when present,
 * otherwise Life Signal Check's own loudestSignal, otherwise no proposal
 * at all (honest, never a guess) so Screen 2 opens straight to her own
 * pick with no "Yes, start here" path to offer.
 */
export type ResetPlanProposal = {
  signal: Signal | null;
  heading: string;
  body: string;
};

export function buildResetPlanProposal(snapshot: ResetPlanSnapshot): ResetPlanProposal {
  if (snapshot.rpl && snapshot.targetSignal) {
    const signal = snapshot.targetSignal;
    const matchedLsc = snapshot.lsc && snapshot.lsc.pattern !== 'quiet_body' && snapshot.lsc.loudestSignal === signal;
    return {
      signal,
      heading: `Let's start with ${SIGNAL_LABEL[signal]}.`,
      body: matchedLsc
        ? `Life Signal Check found ${SIGNAL_LABEL[signal]} was the loudest thing your body is telling you, and your Readiness Pulse pointed to the same place. That is where I want to begin.`
        : `Your Readiness Pulse pointed here. This is the one place I have the clearest read on right now.`,
    };
  }
  if (snapshot.lsc && snapshot.lsc.pattern !== 'quiet_body' && snapshot.loudestSignal) {
    const signal = snapshot.loudestSignal;
    return {
      signal,
      heading: `Let's start with ${SIGNAL_LABEL[signal]}.`,
      body: `Life Signal Check found ${SIGNAL_LABEL[signal]} was the loudest thing your body is telling you. That is where I want to begin.`,
    };
  }
  return {
    signal: null,
    heading: "This one is your call.",
    body: "I don't have a strong enough read yet to propose a starting point honestly, so you choose where to begin.",
  };
}

export const RESET_PLAN_ALTERNATIVE_PROMPT = 'Or choose a different place to start:';

/** Screen 4's default tier — her final readiness pattern when a Readiness Pulse session exists, otherwise the noticing tier (never presumed to be Ready Now), so Root never disappears even with a thin snapshot. */
export function resetPlanProposedTier(snapshot: ResetPlanSnapshot): ActionTier {
  return snapshot.finalReadinessPattern ?? 'still_deciding';
}

/** Screen 3 — links the chosen focus to her top value only when the snapshot genuinely supports it, the exact same adjacency + non-aligned rule Body-Value Echo uses (lib/life-signal-check/adjacency.ts), applied here to her chosen focus rather than the loudest signal. */
export type ResetPlanWhyItMatters = { linked: boolean; text: string };

export function buildResetPlanWhyItMatters(snapshot: ResetPlanSnapshot, focusSignal: Signal): ResetPlanWhyItMatters {
  const cvs = snapshot.cvs;
  if (cvs && cvs.branch !== 'aligned' && isAdjacent(cvs.topValue, focusSignal)) {
    return {
      linked: true,
      text: `${AREA_LABEL[cvs.topValue]} is what matters most to you, and your Core Values Snapshot showed it hasn't been fully protected lately. ${SIGNAL_LABEL[focusSignal]} is where that tends to show up first.`,
    };
  }
  return {
    linked: false,
    text: `${SIGNAL_LABEL[focusSignal]} does not need a bigger reason than this: it is what is real for you right now, and that is enough to start.`,
  };
}

/** Screen 4 — the action pair for a focus + tier, philosophy line included. */
export function buildResetPlanActionCard(focusSignal: Signal, tier: ActionTier): { philosophy: string; action: ResetPlanAction; tierLabel: string } {
  return {
    philosophy: RESET_PLAN_PHILOSOPHY_LINE,
    action: resetPlanAction(focusSignal, tier),
    tierLabel: READINESS_PATTERN_LABEL[tier],
  };
}

/** Screen 5 — what I will actually do, only what ships in this build. */
export const RESET_PLAN_AGREEMENT_COPY = {
  heading: 'What I will do',
  dayThreeLine: "On day 3, I will check in with a simple question: how is it going.",
  daySevenLine: 'On day 7, I will reflect back the real pattern, from what you actually logged.',
  difficultDayOfferLine: "If you log \"not today\" a couple of times, I will offer to switch you to the difficult-day version instead of quietly disappearing.",
};

/** The four response groups the build brief names, keyed by CoachingTonePreference. adaptive/unclear fall to the same gentle middle as the default. */
export function buildResetPlanMissHandlingLine(tone: CoachingTonePreference, focusSignal: Signal): string {
  switch (tone) {
    case 'direct':
      return `You logged not today several times this week. Let's make it easier.`;
    case 'encouragement':
      return `A few "not today" days on ${SIGNAL_LABEL[focusSignal]} is real life, not a failure. I'm here, and the difficult-day version is ready whenever you want it.`;
    case 'meaning_anchored':
      return `A few "not today" days does not undo why ${SIGNAL_LABEL[focusSignal]} mattered enough to start here. The difficult-day version keeps you connected to that, even on the hard days.`;
    case 'education_first':
      return `A few "not today" days on ${SIGNAL_LABEL[focusSignal]} in a row usually just means the action is sized too big for this week. Shrinking to the difficult-day version protects the habit while things settle.`;
    case 'autonomous':
      return 'This plan is still here whenever you are ready.';
    case 'adaptive':
    case 'unclear':
    default:
      return `A few "not today" days happened. No pressure, the difficult-day version is right here if it would help.`;
  }
}

/** Screen 6 — success defined honestly, "most days" framing, never streaks. Noticing-tier actions (still_deciding/not_yet) succeed by noticing, not doing. */
export function buildResetPlanSuccessDefinition(tier: ActionTier): string {
  if (tier === 'still_deciding' || tier === 'not_yet') {
    return "Success here is not about doing something every day. It is about noticing, most days, honestly, even when the answer is nothing changed.";
  }
  return 'Success here is not a streak. It is showing up for the normal version most days, the difficult-day version on the days that need it, and staying honest on the days you do neither.';
}

export const RESET_PLAN_CLOSING_HEADING = 'Your Personal Reset Plan';

/** The dashboard entry card's exact three-state locked copy. */
export const RESET_PLAN_ENTRY_CARD_COPY = {
  before: {
    title: 'Your Personal Reset Plan',
    body: "I'm ready to turn everything you've discovered into one place to begin.",
    button: 'Create My Plan',
  },
  midCreation: {
    button: 'Continue My Plan',
  },
};

/** Day-3 check-in prompt, phrased against the real chosen focus. */
export function buildResetPlanDay3Prompt(focusSignal: Signal): string {
  return `Three days in on ${SIGNAL_LABEL[focusSignal]}. How is it going?`;
}

export function buildResetPlanDay3Reflection(response: ResetPlanDay3Response): string {
  switch (response) {
    case 'going_well':
      return "Good. Keep returning to it, that is the whole plan.";
    case 'mixed':
      return "That is completely normal for day 3. The difficult-day version exists exactly for the days the normal one does not fit.";
    case 'not_started':
      return "No judgment here. If the action still feels too big, tell Root and it can shrink further.";
  }
}

/** The real pattern behind a set of daily logs, for the day-7 reflection. Zero-logged-day and pure-not-today cases are described honestly, never as "you missed." */
export type ResetPlanDay7Pattern = 'no_response' | 'mostly_normal' | 'mixed_effort' | 'mostly_not_today';

export function classifyResetPlanDay7Pattern(logs: ResetPlanDailyLog[]): { pattern: ResetPlanDay7Pattern; normalCount: number; difficultCount: number; notTodayCount: number; loggedCount: number } {
  const normalCount = logs.filter((l) => l.state === 'completed_normal').length;
  const difficultCount = logs.filter((l) => l.state === 'completed_difficult').length;
  const notTodayCount = logs.filter((l) => l.state === 'not_today').length;
  const loggedCount = normalCount + difficultCount + notTodayCount;

  let pattern: ResetPlanDay7Pattern;
  if (loggedCount === 0) pattern = 'no_response';
  // Not-today dominates whenever it outnumbers every real return to the
  // action combined — checked first, since a week that's mostly "not
  // today" is honest information Root should name plainly, not soften
  // into "mixed effort".
  else if (notTodayCount > normalCount + difficultCount) pattern = 'mostly_not_today';
  // Any real use of the difficult-day version alongside the normal one is
  // a genuine mix worth naming as such, not folded into "mostly normal".
  else if (difficultCount > 0) pattern = 'mixed_effort';
  else pattern = 'mostly_normal';

  return { pattern, normalCount, difficultCount, notTodayCount, loggedCount };
}

export function buildResetPlanDay7Reflection(logs: ResetPlanDailyLog[], focusSignal: Signal): string {
  const result = classifyResetPlanDay7Pattern(logs);
  switch (result.pattern) {
    case 'no_response':
      return `No response logged this week on ${SIGNAL_LABEL[focusSignal]}. That is not the same as missing it, Root just does not have anything logged to reflect back yet. Whenever you are ready to start tapping, the plan is right here.`;
    case 'mostly_normal':
      return `Real, consistent return to ${SIGNAL_LABEL[focusSignal]} this week, mostly the normal version. That is exactly what this plan is for.`;
    case 'mixed_effort':
      return `A real mix this week on ${SIGNAL_LABEL[focusSignal]}, normal some days, the difficult-day version on others. That mix is the plan working, not the plan failing.`;
    case 'mostly_not_today':
      return `Mostly "not today" this week on ${SIGNAL_LABEL[focusSignal]}. That is honest information, not a failure. Worth trying the difficult-day version instead, or shrinking the action further.`;
  }
}

/** Difficult-day offer trigger — two or more explicit not-today records on the current plan, per the build brief. */
export function shouldOfferDifficultDayVersion(logs: ResetPlanDailyLog[]): boolean {
  return logs.filter((l) => l.state === 'not_today').length >= 2;
}

/** Coach-facing label for the snapshot's Q6 obstacle field — plain restatement of Readiness Pulse's own rpl_q6 option labels (migration 141), for the coach panel only; never shown to the member in this experience. */
export const Q6_OBSTACLE_LABEL: Record<string, string> = {
  schedule: 'Her schedule',
  follow_through: 'Her own follow-through',
  other_people: "Other people's needs",
  expecting_too_much: 'Expecting too much too fast',
};

export function resetPlanDailyStateLabel(state: ResetPlanDailyState): string {
  switch (state) {
    case 'completed_normal':
      return 'Logged: the normal version, today counted.';
    case 'completed_difficult':
      return 'Logged: the difficult-day version, today counted.';
    case 'not_today':
      return 'Logged: not today, and that is fine.';
  }
}
