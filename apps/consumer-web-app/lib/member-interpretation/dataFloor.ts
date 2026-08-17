/**
 * Member Interpretation Layer — the data floor.
 *
 * Below this floor the app may not call anything a strength or a problem.
 *
 * The audit's example, live on Home and on Root Score on 2026-08-17, from
 * three check-ins in thirteen days over a recovery score of 50 out of 100:
 *
 *   "Your recovery is a real strength, while movement consistency is your
 *    clearest opportunity."
 *
 * `buildExplanation` produced that by sorting five domain averages and
 * declaring the top one a strength and the bottom one the opportunity, with
 * no minimum data requirement of any kind. The only guard was that more
 * than one domain had a score at all.
 *
 * Note also what the sentence did: recovery scored 50, which is not a
 * strength by any reading, it was merely the least bad of five thin
 * numbers. A ranking is not a verdict, and this floor is what stops one
 * being printed as the other.
 *
 * Pure.
 */

import { MIN_LOGGED_DAYS_FOR_STRENGTH_OR_PROBLEM } from './config';
import { dataFloorStatement } from './copy';
import type { DataFloor } from './types';

/**
 * Whether the member has logged enough for a verdict about her.
 *
 * `loggedDays` is distinct days with a completed check-in, not check-in
 * count and not days since signup. A member who logged four check-ins on
 * one afternoon has one day, and a member thirteen days into the product
 * with three check-ins has three, not thirteen.
 */
export function computeDataFloor(loggedDays: number): DataFloor {
  return {
    loggedDays,
    requiredDays: MIN_LOGGED_DAYS_FOR_STRENGTH_OR_PROBLEM,
    met: loggedDays >= MIN_LOGGED_DAYS_FOR_STRENGTH_OR_PROBLEM,
    statement: dataFloorStatement(loggedDays),
  };
}
