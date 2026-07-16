/**
 * Picks the one habit worth calling out in today's Morning Brief. Pure —
 * no I/O, no fabrication: returns null when every active habit is already
 * logged today, or the member has none, rather than inventing a
 * suggestion with nothing behind it.
 */

import type { Habit } from '@mef/shared-types-contracts';
import type { CoachingFocusArea } from '../brain/types';

/** Prefers an incomplete habit whose domain relates to today's coaching focus (e.g. focus 'sleep' + a habit domained 'sleep') so the brief reads as one coherent plan rather than two unrelated suggestions; falls back to the first incomplete active habit otherwise. */
export function selectHabitToPrioritize(
  activeHabits: Habit[],
  habitLogsToday: Record<string, boolean>,
  focusArea: CoachingFocusArea
): Habit | null {
  const incomplete = activeHabits.filter((habit) => !habitLogsToday[habit.id]);
  if (incomplete.length === 0) return null;

  const focusKey = String(focusArea).toLowerCase();
  const focusMatch = incomplete.find((habit) => habit.domain.toLowerCase().includes(focusKey));
  return focusMatch ?? incomplete[0]!;
}
