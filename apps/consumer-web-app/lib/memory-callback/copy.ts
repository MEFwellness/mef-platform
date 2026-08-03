/**
 * Root Presence System (Prompt 4), requirement 4: Memory Callbacks. Pure
 * functions only, no I/O — same discipline as lib/core-values-snapshot/
 * copy.ts's build<Domain><Noun>(scoring) convention. Each builder takes a
 * typed context (types.ts) assembled in data.ts from real rows and
 * returns a sentence, or `null` when the backing data doesn't exist.
 * Never fabricates, never rounds a real number away.
 */

import { WELCOME_GOALS } from '../welcome/goals';
import { daysBetweenLocalDates } from '../feed/dateMath';
import type {
  Day3ContrastCallbackContext,
  FindingCallbackContext,
  GoalCallbackContext,
  TenureCallbackContext,
} from './types';

const WELCOME_GOAL_LABEL: Record<string, string> = Object.fromEntries(
  WELCOME_GOALS.map((goal) => [goal.key, goal.label])
);

/** Her stated goal from intake, in her own words where recorded (goals_other), otherwise the selected option's label. */
export function buildGoalCallback(ctx: GoalCallbackContext | null): string | null {
  if (!ctx) return null;

  const other = ctx.goalsOther?.trim();
  if (other) {
    return `You told me, in your own words, that ${other} was what brought you here.`;
  }

  const label = ctx.primaryGoal ? WELCOME_GOAL_LABEL[ctx.primaryGoal] : null;
  if (!label) return null;

  return `You told me ${label.toLowerCase()} was what brought you here.`;
}

/** How long she's been checking in, real count and real first date. Never fires for a member with zero check-ins — there's nothing to remember yet. */
export function buildTenureCallback(ctx: TenureCallbackContext | null): string | null {
  if (!ctx || ctx.totalCheckins === 0 || !ctx.firstCheckinLocalDate) return null;

  const checkinPhrase = `${ctx.totalCheckins} check-in${ctx.totalCheckins === 1 ? '' : 's'}`;
  const days = daysBetweenLocalDates(ctx.firstCheckinLocalDate, ctx.todayLocalDate);

  if (days <= 0) {
    return `You've logged ${checkinPhrase} with me so far.`;
  }

  return `You've been checking in with me for ${days} day${days === 1 ? '' : 's'} now, ${checkinPhrase} so far.`;
}

const DAY3_PHRASE: Record<Day3ContrastCallbackContext['day3Response'], string> = {
  going_well: 'going well',
  mixed: 'mixed',
  not_started: "hadn't started yet",
};

/** Her real day-3 answer, contrasted honestly with wherever this sentence lands (a day-7 message, a case-view line) — this function only states what she said, the contrast is left to the caller's own "and now" framing. */
export function buildDay3ContrastCallback(ctx: Day3ContrastCallbackContext | null): string | null {
  if (!ctx) return null;
  return `On day 3 of your ${ctx.experienceLabel}, you told me it was ${DAY3_PHRASE[ctx.day3Response]}.`;
}

/** A real, already-earned finding from weeks ago, connected honestly to now. Requires the finding to actually be in the past — a same-day or future computedAt (shouldn't happen, but never trusted blindly) returns null rather than saying "0 weeks ago." */
export function buildFindingCallback(ctx: FindingCallbackContext | null): string | null {
  if (!ctx) return null;

  const computedLocalDate = ctx.computedAt.slice(0, 10);
  const days = daysBetweenLocalDates(computedLocalDate, ctx.todayLocalDate);
  if (days < 7) return null;

  const weeksAgo = Math.max(1, Math.round(days / 7));
  return `${weeksAgo} week${weeksAgo === 1 ? '' : 's'} ago, I noticed something that still holds: ${ctx.memberSentence}`;
}

/** Appends a real callback sentence to a base line, with a space, or returns the base line unchanged when there's no callback to add. Shared by every speaking spot so a missing callback never leaves a trailing space or an empty sentence. */
export function appendCallback(base: string, callback: string | null): string {
  if (!callback) return base;
  return `${base} ${callback}`;
}

/**
 * Dashboard Evolution (Prompt 5), requirement 7: picks a single memory
 * callback to speak from the three dormant-until-now candidates, in
 * priority order from most to least specific/timely — a day-3 contrast
 * is a callback to something she told me recently, a resurfaced finding
 * is a specific-but-older discovery, and tenure is the always-available
 * generic fallback (any member with at least one check-in has one).
 * Each argument is already the real built sentence (or null) from this
 * module's own builders above — this function does no data access and
 * fabricates nothing itself, it only orders what's already honest.
 */
export function pickMemoryCallback(
  day3ContrastCallback: string | null,
  findingCallback: string | null,
  tenureCallback: string | null
): string | null {
  return day3ContrastCallback ?? findingCallback ?? tenureCallback;
}
