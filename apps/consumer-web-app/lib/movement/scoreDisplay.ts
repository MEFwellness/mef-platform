/**
 * Whether the Movement Score renders at all, and what it is called.
 *
 * JUDGMENT ITEM 2, AWAITING A DECISION. See docs/BUILD_STATUS.md for the
 * two options written out in full.
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
 * What IS done, so either answer is a one-line change:
 *
 *   - `movementScoreDisplay()` is the single place the tile's contents are
 *     decided, including returning null for "do not render the tile at
 *     all", which components/layout/WhenNotEmpty.tsx's rule already
 *     requires of every other section.
 *   - The development caveat is deleted from the component.
 *   - Both wordings are written out below and both are covered by tests.
 */

import { movementScoreLabel } from './score';

/**
 * 'score_out_of_100' (current): the number, over 100, with its band label.
 * 'sessions_this_week': no score at all. The tile is not rendered and the
 * Weekly Goal tile, which counts real completed sessions against a real
 * target, takes the row on its own.
 */
export const MOVEMENT_SCORE_MODE: 'score_out_of_100' | 'sessions_this_week' = 'score_out_of_100';

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
