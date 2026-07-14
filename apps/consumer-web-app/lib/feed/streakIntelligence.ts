/**
 * Streak Intelligence (Part 5) — coaches the streak instead of just
 * displaying a number. Reuses accountability.ts's currentStreakLength
 * (the exact count Milestone 2's narrative already celebrates) rather
 * than a second, possibly-diverging definition of "streak" — this module
 * only adds the surrounding context (longest streak in the window, a
 * recent recovery, days since the last check-in) and turns it into calm,
 * never-shaming language.
 */

import type { DailyCheckin } from '@mef/shared-types-contracts';
import { currentStreakLength } from '../ai/agents/accountability';
import { daysBetweenLocalDates } from './dateMath';

export type StreakInsight = {
  currentStreak: number;
  longestStreak: number;
  /** null when the member has never checked in at all within the provided window. */
  daysSinceLastCheckin: number | null;
  checkedInToday: boolean;
  /** A small streak just resumed after a real gap — the "nice recovery" moment. */
  justRecovered: boolean;
  /** The current streak ties or exceeds every other run in the window, and the window actually contains more than one run. */
  isLongestInWindow: boolean;
};

/** Every streak run-length in the window (not just the trailing one) — walks the same "no calendar gap" rule as currentStreakLength, applied across the whole list instead of just its tail. */
function allStreakLengths(checkinsOldestFirst: DailyCheckin[]): number[] {
  if (checkinsOldestFirst.length === 0) return [];
  const lengths: number[] = [];
  let run = 1;
  for (let i = 1; i < checkinsOldestFirst.length; i++) {
    const gap = daysBetweenLocalDates(
      checkinsOldestFirst[i - 1]!.local_date,
      checkinsOldestFirst[i]!.local_date
    );
    if (gap === 1) {
      run++;
    } else {
      lengths.push(run);
      run = 1;
    }
  }
  lengths.push(run);
  return lengths;
}

export function computeStreakInsight(
  checkinsOldestFirst: DailyCheckin[],
  todayLocalDate: string
): StreakInsight {
  const currentStreak = currentStreakLength(checkinsOldestFirst);
  const lengths = allStreakLengths(checkinsOldestFirst);
  const longestStreak = lengths.length > 0 ? Math.max(...lengths) : 0;

  const latest = checkinsOldestFirst[checkinsOldestFirst.length - 1] ?? null;
  const daysSinceLastCheckin = latest
    ? daysBetweenLocalDates(latest.local_date, todayLocalDate)
    : null;
  const checkedInToday = daysSinceLastCheckin === 0;

  const justRecovered =
    checkedInToday && currentStreak >= 2 && currentStreak <= 3 && lengths.length >= 2;

  const isLongestInWindow =
    checkedInToday && currentStreak >= 3 && currentStreak === longestStreak && lengths.length >= 2;

  return {
    currentStreak,
    longestStreak,
    daysSinceLastCheckin,
    checkedInToday,
    justRecovered,
    isLongestInWindow,
  };
}

/**
 * One calm sentence, priority-ordered, never more than one (same "pick the
 * single most relevant fact" discipline as
 * lib/narrative/coachingReference.ts). A broken streak is worded as an
 * invitation, never a scolding — per Part 5's explicit "never shame"
 * instruction.
 */
export function buildStreakMessage(insight: StreakInsight): string | null {
  if (!insight.checkedInToday && insight.daysSinceLastCheckin !== null) {
    if (insight.daysSinceLastCheckin >= 2) {
      return `It's been ${insight.daysSinceLastCheckin} days since your last check-in — no worries, today's a great day to start again.`;
    }
    return null;
  }

  if (insight.isLongestInWindow) {
    return `This is your longest streak in a while — ${insight.currentStreak} days and counting.`;
  }
  if (insight.justRecovered) {
    return `Nice recovery getting back to a ${insight.currentStreak}-day streak — that consistency is what counts.`;
  }
  if (insight.currentStreak >= 3) {
    return `You've checked in ${insight.currentStreak} days in a row.`;
  }
  return null;
}
