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

/** Keyed by [band][hasCheckinToday]. Every line is a short, standalone clause meant to sit under "{greetingWord}, {firstName}" — never repeats the greeting word itself, and never claims anything beyond "a check-in exists for today or it doesn't." */
const GREETING_LINES: Record<GreetingBand, { pending: string[]; done: string[] }> = {
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
}: {
  greetingWord: TimeContext['greetingWord'];
  hasCheckinToday: boolean;
  localDate: string;
}): string {
  const band = greetingBandFromWord(greetingWord);
  const variants = GREETING_LINES[band][hasCheckinToday ? 'done' : 'pending'];
  const index = dailySeed(localDate) % variants.length;
  return variants[index]!;
}
