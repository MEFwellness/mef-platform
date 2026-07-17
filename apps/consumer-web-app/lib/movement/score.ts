/**
 * Movement Score — explicitly a placeholder metric (per this milestone's
 * spec) pending richer signals: wearable-verified exertion, range-of-
 * motion tracking, coach-reviewed form quality. Today it's an honest,
 * real computation over actual completed-session history (adherence
 * against a default weekly target) — never a fabricated number — but the
 * UI must still label it "placeholder" so a member doesn't mistake a
 * simple completion ratio for a true movement-quality score.
 */

import type { MovementSession } from '@mef/shared-types-contracts';

/**
 * No goal-capture UI exists yet (see lib/movement/rules/facts.ts's
 * `goals` field), so every member is scored against the same default
 * weekly target until one does.
 */
export const DEFAULT_WEEKLY_SESSION_TARGET = 4;

/**
 * Returns null when the member has no session history in the trailing 7
 * days at all — "not enough data yet," never a zeroed-out score.
 */
export function computeMovementScore(
  sessionsLast7Days: MovementSession[],
  targetSessionsPerWeek: number = DEFAULT_WEEKLY_SESSION_TARGET
): number | null {
  if (sessionsLast7Days.length === 0) return null;
  const completed = sessionsLast7Days.filter((s) => s.status === 'completed').length;
  return Math.min(100, Math.round((completed / targetSessionsPerWeek) * 100));
}

export function movementScoreLabel(score: number): string {
  if (score >= 85) return 'Excellent consistency';
  if (score >= 60) return 'On track';
  if (score >= 30) return 'Building momentum';
  return 'Just getting started';
}
