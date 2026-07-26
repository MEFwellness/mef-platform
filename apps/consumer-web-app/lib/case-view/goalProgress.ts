/**
 * Case View — the headline goal-progress measure (requirement 5). Pure,
 * no I/O. Deliberately outside the daily check-in question flow
 * entirely (member_goal_progress_checkins, migration 107) — a separate,
 * simple, un-scored self-rating prompted on its own cadence from the
 * case view page itself, never a new field on daily_checkins or a new
 * driver_probe_questions row.
 */

import type { CaseHeader, GoalProgressPoint, GoalProgressView } from './types';

/** "Periodically re-ask" — once a week. A single named constant, same discipline as every other cadence/threshold in this codebase. */
export const GOAL_PROGRESS_RECHECK_DAYS = 7;

function daysBetween(fromDate: string, toDate: string): number {
  return Math.round((new Date(`${toDate}T12:00:00Z`).getTime() - new Date(`${fromDate}T12:00:00Z`).getTime()) / (24 * 60 * 60 * 1000));
}

/** Quotes her own wording (or the existing product label she picked) rather than inventing new phrasing. */
export function buildGoalProgressPromptText(header: CaseHeader): string {
  return `How is "${header.title}" going for you lately?`;
}

export function buildGoalProgressView(
  header: CaseHeader,
  ratingRows: { localDate: string; rating: number }[],
  todayLocalDate: string
): GoalProgressView {
  const points: GoalProgressPoint[] = ratingRows
    .slice()
    .sort((a, b) => (a.localDate < b.localDate ? -1 : 1))
    .map((r) => ({ date: r.localDate, rating: r.rating }));

  const lastPoint = points[points.length - 1];
  const promptDue = !lastPoint || daysBetween(lastPoint.date, todayLocalDate) >= GOAL_PROGRESS_RECHECK_DAYS;

  return { points, promptDue, promptText: buildGoalProgressPromptText(header) };
}
