/**
 * Dashboard Evolution (Prompt 5), requirement 1: Dynamic Greetings.
 * Pure, no I/O — components/dashboard/HomeHero.tsx already receives
 * `greetingWord` ('Good morning' / 'Good afternoon' / 'Good evening')
 * from lib/feed/timeContext.ts; this module adds a short second line
 * underneath it, warm and Root-voiced, that varies by real context
 * (whether today's check-in is already done) and rotates across a
 * handful of variations per time band so the hero doesn't say the exact
 * same thing every morning. Never invents anything: the only two real
 * facts available at greeting time are the hour and whether a check-in
 * exists for today, and both come from data already fetched by
 * app/dashboard/page.tsx.
 *
 * Rotation is keyed on the member's own local_date, not request time or
 * randomness: the same day always shows the same line (so a page reload
 * mid-morning isn't jarring), and the line changes on its own from one
 * day to the next — "several variations per time band so mornings don't
 * repeat the identical line daily," per this prompt's own requirement.
 */

import type { TimeContext } from '../feed/timeContext';

export type GreetingBand = 'morning' | 'afternoon' | 'evening';

export function greetingBandFromWord(word: TimeContext['greetingWord']): GreetingBand {
  if (word === 'Good morning') return 'morning';
  if (word === 'Good afternoon') return 'afternoon';
  return 'evening';
}

/**
 * Which way the Root Score printed directly below this line has moved
 * since its last snapshot. 'flat' is a real, shown state ("Steady" on the
 * hero's change pill), and null means no change is being shown at all
 * (no score yet, or no previous snapshot to compare against).
 */
export type ScoreDirection = 'up' | 'down' | 'flat' | null;

/** Keyed by [band][hasCheckinToday]. Every line is a short, standalone clause meant to sit under "{greetingWord}, {firstName}" — never repeats the greeting word itself, and never claims anything beyond "a check-in exists for today or it doesn't." */
export const GREETING_LINES: Record<GreetingBand, { pending: string[]; done: string[] }> = {
  morning: {
    pending: [
      "Ready when you are.",
      "Let's see what today brings.",
      "Here's where things stand.",
      "A fresh page for today.",
    ],
    done: [
      "I'm glad you started the day with a check-in.",
      "Nice work checking in already.",
      "Good start to the day.",
    ],
  },
  afternoon: {
    pending: [
      "Still time to check in today.",
      "Here's where things stand.",
      "Good to see you this afternoon.",
    ],
    done: [
      "Good to see you again.",
      "Here's what's been happening today.",
      "Thanks for checking in earlier.",
    ],
  },
  evening: {
    pending: [
      "There's still time for today's check-in.",
      "Let's take a look at today.",
      "Here's where things stand tonight.",
    ],
    done: [
      "Thanks for checking in today.",
      "Here's how today went.",
      "Glad you made time for yourself today.",
    ],
  },
};

/**
 * The same three bands, for a day the Root Score printed underneath this
 * line has gone DOWN or stayed FLAT.
 *
 * Copy-and-honesty pass (2026-08-14). The hero showed "Good start to the
 * day" directly above a score reading points down, which is the one thing
 * a greeting must never do: contradict the number on the same screen. The
 * fix is not to remove the line, it is to branch it on the same real fact
 * the pill is already rendering.
 *
 * Every line here is neutral rather than negative. A score that slipped is
 * not a failing and Root does not comment on it here; these lines simply
 * orient her ("here is where things stand") or acknowledge only what is
 * unambiguously true (she checked in), so they sit honestly next to a
 * down, a flat, or (were it ever shown here) an up number alike.
 */
export const NEUTRAL_GREETING_LINES: Record<GreetingBand, { pending: string[]; done: string[] }> = {
  morning: {
    pending: [
      "Here's where things stand.",
      "Let's take today as it comes.",
      'Ready when you are.',
    ],
    done: [
      "Thanks for checking in.",
      "Here's where things stand today.",
      "I have today's check-in from you.",
    ],
  },
  afternoon: {
    pending: [
      "Here's where things stand.",
      'Still time to check in today.',
      "Let's take a look at today.",
    ],
    done: [
      'Thanks for checking in earlier.',
      "Here's where things stand this afternoon.",
      "Here's what today looks like so far.",
    ],
  },
  evening: {
    pending: [
      "Here's where things stand tonight.",
      "There's still time for today's check-in.",
      "Let's take a look at today.",
    ],
    done: [
      'Thanks for checking in today.',
      "Here's where today landed.",
      "Here's where things stand tonight.",
    ],
  },
};

/** A small, stable non-negative integer derived from a YYYY-MM-DD local date string — deterministic across requests for the same day, with no dependency on request timing or randomness. */
function dailySeed(localDate: string): number {
  const digitsOnly = localDate.replace(/-/g, '');
  const asNumber = Number(digitsOnly);
  return Number.isFinite(asNumber) ? asNumber : 0;
}

export function buildGreetingLine({
  greetingWord,
  hasCheckinToday,
  localDate,
  scoreDirection = null,
}: {
  greetingWord: TimeContext['greetingWord'];
  hasCheckinToday: boolean;
  localDate: string;
  /**
   * Which way the Root Score shown directly below this line has moved.
   * 'down' and 'flat' switch to the neutral set above; 'up' and null (no
   * change shown at all) keep the ordinary warm lines. Defaults to null so
   * every existing caller and fixture behaves exactly as it did.
   */
  scoreDirection?: ScoreDirection;
}): string {
  const band = greetingBandFromWord(greetingWord);
  const contradictsScore = scoreDirection === 'down' || scoreDirection === 'flat';
  const source = contradictsScore ? NEUTRAL_GREETING_LINES : GREETING_LINES;
  const variants = source[band][hasCheckinToday ? 'done' : 'pending'];
  const index = dailySeed(localDate) % variants.length;
  return variants[index]!;
}

/** The hero's own change pill and this line read the same number, so they can never disagree about which way it went. Null in, null out: no change shown means no direction to respect. */
export function scoreDirectionFromChange(change: number | null | undefined): ScoreDirection {
  if (change === null || change === undefined) return null;
  if (change > 0) return 'up';
  if (change < 0) return 'down';
  return 'flat';
}
