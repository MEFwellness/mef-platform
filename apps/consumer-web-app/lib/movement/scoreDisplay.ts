/**
 * Whether the Movement Score renders at all, and what it is called.
 *
 * DECIDED 2026-08-17: the score does not render.
 *
 * Live on the Movement screen the audit found: "MOVEMENT SCORE / 0 / 100 /
 * Just getting started / EARLY VERSION, MORE DEPTH COMING". Three separate
 * problems in one tile. The development-status caveat is straightforward
 * leakage and is gone in this build either way. What is left is a real
 * question with no obviously right answer: `computeMovementScore` divides
 * completed sessions by a weekly target of four, so the number is an
 * honest completion ratio, and it is presented as a "score out of 100",
 * which reads as a judgement of how well she moves. Removing it costs her
 * the only at-a-glance number on that screen; keeping it means a member
 * with a busy week reads "25 / 100" about her body.
 *
 * A completion ratio presented as a score out of 100 is the same
 * overstatement this whole direction exists to remove, and the tile beside
 * it already says the honest version: "2 of 4 sessions", counting real
 * completed sessions against a real weekly target. So the score tile does
 * not render, the Weekly Goal tile takes the row on its own, and the score
 * comes back when it measures something a score should measure.
 *
 * `computeMovementScore` in ./score.ts is deliberately NOT deleted. It is a
 * real computation over real history, it is what a future version would
 * build on, and nothing is served by throwing it away because today's
 * presentation of it was wrong.
 */

import { movementScoreLabel } from './score';

/**
 * 'sessions_this_week' (decided): no score at all. The tile is not
 * rendered and the Weekly Goal tile takes the row on its own.
 * 'score_out_of_100': the retired presentation, kept named so the
 * behaviour that was removed is legible rather than merely absent.
 */
export const MOVEMENT_SCORE_MODE: 'score_out_of_100' | 'sessions_this_week' = 'sessions_this_week';

export type MovementScoreDisplay = {
  heading: string;
  /** The big number, already formatted. Null when there is nothing to show yet. */
  value: string | null;
  /** The line under it. Null when there is none. */
  caption: string | null;
  /** The honest sentence for a member with no session history at all. */
  emptyStatement: string;
};

/**
 * What the Movement Score tile should show, or null when it should not
 * exist.
 *
 * Returning null rather than rendering an empty tile is the point: a
 * heading with nothing under it is the same mistake as a placeholder, and
 * this app already has one rule about that.
 */
export function movementScoreDisplay(score: number | null): MovementScoreDisplay | null {
  if (MOVEMENT_SCORE_MODE === 'sessions_this_week') return null;

  return {
    heading: 'Movement Score',
    value: score === null ? null : `${score}`,
    caption: score === null ? null : movementScoreLabel(score),
    emptyStatement: 'Nothing logged in the last week, so there is no score yet.',
  };
}
